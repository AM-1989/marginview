import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Upload, Loader2, FileDown, Filter, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  RotateCcw, X, Info, MessageSquareText, PenLine,
} from 'lucide-react';
import { exportPDF } from '../lib/exportPDF';
import {
  parseExcelToVarRows, extractPeriods, extractFilterOptions,
  filterRowsByPeriodAndFilters, computeVarianceEffects, generateInsights,
  FILTER_DIMS, FILTER_DIM_LABELS,
} from '../lib/varianceAnalysis';
import type {
  VarRow, FilterDim,
  ComparedLine, TableGroup, WaterfallPoint, EffectsResult, AIInsight,
} from '../lib/varianceAnalysis';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtEur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct = (v: number, dec = 2) => isFinite(v) ? `${v.toFixed(dec)}%` : 'N/D';
const fmtPp  = (v: number) => isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp` : 'N/D';
const fmtDiff = (v: number) => `${v >= 0 ? '+' : ''}${fmtEur.format(v)}`;
const clrPp  = (v: number) => v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-slate-500';
const nd     = (v: number | null, fmt: (n: number) => string) => v !== null && isFinite(v) ? fmt(v) : 'N/D';

// ─── Mix effect breakdown by dimension ───────────────────────────────────────
// Each dimension (Brand, Categoria, etc.) is an INDEPENDENT decomposition of
// effMix. Every chart sums to exactly effMix (= 100%) on its own.
// The 4 charts are NOT additive across each other — they are 4 different
// "lenses" on the same total effect.
//
// Exact proof: Σ_all_i [ m1_i × (shareM_i − shareP1_i) ] = effMix
// where shareM_i  = q2_i × p1Eff_i / totalRevM  (P2 qty at P1 prices share)
//       shareP1_i = q1_i × p1Eff_i / totalRevP1  (= rev1_i / totalRev1)
//
// Guarantees for 100% coverage:
// 1. No lines skipped — products with empty dim field go to "N/D"
// 2. No items cut off — groups beyond display limit are aggregated as "Altri"
//    so that Σ visible bars = effMix always.

function MixEffectBreakdown({ effects }: { effects: EffectsResult }) {
  const md = effects.mixDecomposition;

  const rows = [
    { label: 'Mix Brand',          value: md.brand          },
    { label: 'Mix Categoria',      value: md.categoria      },
    { label: 'Mix Sottocategoria', value: md.sottocategoria },
    { label: 'Mix Formato',        value: md.formato        },
    { label: 'Residuo (referenze)',value: md.residuo        },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">Analisi Effetto Mix per Dimensione</h4>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 text-xs">
            <span className="text-slate-600">{label}</span>
            <span className={`font-semibold tabular-nums ${clrPp(value)}`}>{fmtPp(value)}</span>
          </div>
        ))}
        <div className={`flex items-center justify-between px-3 py-2.5 border-t-2 border-slate-300 ${md.totale >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <span className="text-xs font-bold text-slate-800">TOTALE MIX</span>
          <span className={`text-sm font-bold tabular-nums ${clrPp(md.totale)}`}>{fmtPp(md.totale)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── 3-Level Hierarchical Mix Table ──────────────────────────────────────────

interface ReferenzaNode {
  line: ComparedLine;
  effPrezzo: number;
  effCosto: number;
}

interface BrandNode {
  brand: string;
  mixContrib: number;       // decimal (0.012 = 1.2 pp)
  marginPct1: number | null;
  marginPct2: number | null;
  referenze: ReferenzaNode[];
}

interface CategoriaNode {
  categoria: string;
  mixContrib: number;
  marginPct1: number | null;
  marginPct2: number | null;
  brands: BrandNode[];
}

function buildHierarchicalMixData(effects: EffectsResult): CategoriaNode[] {
  const { lines, totalRevM, totalRev1, totalRev2 } = effects;

  type BrandBucket = {
    rev1: number; cost1: number; rev2: number; cost2: number;
    mixContrib: number; referenze: ReferenzaNode[];
  };

  const catMap = new Map<string, {
    rev1: number; cost1: number; rev2: number; cost2: number;
    mixContrib: number;
    brands: Map<string, BrandBucket>;
  }>();

  for (const l of lines) {
    const cat   = l.categoria.trim() || 'N/D';
    const brand = l.brand.trim()     || 'N/D';

    const m1 = l.price1Effective > 0
      ? (l.price1Effective - l.unitCost1Effective) / l.price1Effective : 0;
    const shareM  = totalRevM  > 0 ? (l.q2 * l.price1Effective) / totalRevM  : 0;
    const shareP1 = totalRev1  > 0 ? (l.q1 * l.price1Effective) / totalRev1  : 0;
    const mixC = m1 * (shareM - shareP1);

    const cvM = l.q2 * l.unitCost1Effective;
    const rvM = l.q2 * l.price1Effective;
    const mc  = (margin: number, rev: number) => rev > 0 ? margin / rev : 0;
    const effPrezzo = mc(l.rev2 - cvM, totalRev2) - mc(rvM - cvM, totalRevM);
    const effCosto  = mc(l.rev2 - l.cost2, totalRev2) - mc(l.rev2 - cvM, totalRev2);

    if (!catMap.has(cat)) {
      catMap.set(cat, { rev1: 0, cost1: 0, rev2: 0, cost2: 0, mixContrib: 0, brands: new Map() });
    }
    const cd = catMap.get(cat)!;
    cd.rev1 += l.rev1; cd.cost1 += l.cost1;
    cd.rev2 += l.rev2; cd.cost2 += l.cost2;
    cd.mixContrib += mixC;

    if (!cd.brands.has(brand)) {
      cd.brands.set(brand, { rev1: 0, cost1: 0, rev2: 0, cost2: 0, mixContrib: 0, referenze: [] });
    }
    const bd = cd.brands.get(brand)!;
    bd.rev1 += l.rev1; bd.cost1 += l.cost1;
    bd.rev2 += l.rev2; bd.cost2 += l.cost2;
    bd.mixContrib += mixC;
    bd.referenze.push({ line: l, effPrezzo, effCosto });
  }

  const nodes: CategoriaNode[] = [];
  for (const [cat, cd] of catMap.entries()) {
    const brands: BrandNode[] = [];
    for (const [brand, bd] of cd.brands.entries()) {
      brands.push({
        brand,
        mixContrib: bd.mixContrib,
        marginPct1: bd.rev1 > 0 ? (bd.rev1 - bd.cost1) / bd.rev1 : null,
        marginPct2: bd.rev2 > 0 ? (bd.rev2 - bd.cost2) / bd.rev2 : null,
        referenze: bd.referenze.sort(
          (a, b) => Math.abs(b.effPrezzo + b.effCosto) - Math.abs(a.effPrezzo + a.effCosto),
        ),
      });
    }
    brands.sort((a, b) => Math.abs(b.mixContrib) - Math.abs(a.mixContrib));
    nodes.push({
      categoria: cat,
      mixContrib: cd.mixContrib,
      marginPct1: cd.rev1 > 0 ? (cd.rev1 - cd.cost1) / cd.rev1 : null,
      marginPct2: cd.rev2 > 0 ? (cd.rev2 - cd.cost2) / cd.rev2 : null,
      brands,
    });
  }
  return nodes.sort((a, b) => Math.abs(b.mixContrib) - Math.abs(a.mixContrib));
}

// Level 3 — referenza rows (inside brand expansion)
function BrandRow({
  node, brandKey, expanded, onToggle,
}: {
  node: BrandNode; brandKey: string; expanded: boolean; onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-xs font-medium text-slate-700">
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown  className="w-3 h-3 text-slate-400 flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
            }
            {node.brand}
          </div>
        </td>
        <td className={`px-4 py-2.5 text-xs text-right tabular-nums font-semibold ${clrPp(node.mixContrib)}`}>
          {fmtPp(node.mixContrib)}
        </td>
        <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-600">
          {nd(node.marginPct1, v => fmtPct(v * 100))}
        </td>
        <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-600">
          {nd(node.marginPct2, v => fmtPct(v * 100))}
        </td>
      </tr>
      {expanded && (
        <tr key={`${brandKey}-ref`}>
          <td colSpan={4} className="p-0 bg-white">
            <div className="ml-6 border-l-2 border-blue-100">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-50/60 border-b border-blue-100">
                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide">Codice</th>
                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide">Descrizione</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P1</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">Eff. Prezzo</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">Eff. Costo</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P2</th>
                    <th className="px-4 py-2 text-center text-[9px] font-bold text-slate-400 uppercase tracking-wide">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {node.referenze.map(({ line: l, effPrezzo, effCosto }) => (
                    <tr key={l.key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors text-xs">
                      <td className="px-4 py-2 font-mono text-[9px] text-slate-400 whitespace-nowrap">{l.codice}</td>
                      <td className="px-4 py-2 text-slate-600 max-w-[220px] truncate" title={l.descrizione}>
                        {l.descrizione || '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                        {l.isOnlyP2 ? <span className="text-slate-300">N/D</span> : nd(l.marginPct1, v => fmtPct(v * 100))}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${l.presence === 'both' ? clrPp(effPrezzo) : 'text-slate-300'}`}>
                        {l.presence === 'both' ? fmtPp(effPrezzo) : '—'}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${l.presence === 'both' ? clrPp(effCosto) : 'text-slate-300'}`}>
                        {l.presence === 'both' ? fmtPp(effCosto) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                        {l.isOnlyP1 ? <span className="text-slate-300">N/D</span> : nd(l.marginPct2, v => fmtPct(v * 100))}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <PresenceBadge presence={l.presence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Level 2 — brand rows with nested referenze (inside categoria expansion)
function CategoriaRow({
  node, expanded, onToggle, expandedBrands, onToggleBrand,
}: {
  node: CategoriaNode;
  expanded: boolean;
  onToggle: () => void;
  expandedBrands: Set<string>;
  onToggleBrand: (key: string) => void;
}) {
  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs font-semibold text-slate-800">
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown  className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            }
            {node.categoria}
            <span className="text-[10px] font-normal text-slate-400 ml-1">{node.brands.length} brand</span>
          </div>
        </td>
        <td className={`px-4 py-3 text-xs text-right tabular-nums font-bold ${clrPp(node.mixContrib)}`}>
          {fmtPp(node.mixContrib)}
        </td>
        <td className="px-4 py-3 text-xs text-right tabular-nums text-slate-700">
          {nd(node.marginPct1, v => fmtPct(v * 100))}
        </td>
        <td className="px-4 py-3 text-xs text-right tabular-nums text-slate-700">
          {nd(node.marginPct2, v => fmtPct(v * 100))}
        </td>
      </tr>
      {expanded && (
        <tr key={`${node.categoria}-brands`} className="border-b border-slate-200">
          <td colSpan={4} className="p-0 bg-slate-50/40">
            <div className="ml-4 border-l-2 border-slate-300">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide">Brand</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">Contributo Mix Brand</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P1</th>
                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P2</th>
                  </tr>
                </thead>
                <tbody>
                  {node.brands.map(brand => {
                    const bk = `${node.categoria}||${brand.brand}`;
                    return (
                      <BrandRow
                        key={bk}
                        node={brand}
                        brandKey={bk}
                        expanded={expandedBrands.has(bk)}
                        onToggle={() => onToggleBrand(bk)}
                      />
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 border-slate-300 text-xs font-bold ${node.mixContrib >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <td className="px-4 py-2 text-slate-700">Σ {node.categoria}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${clrPp(node.mixContrib)}`}>{fmtPp(node.mixContrib)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nd(node.marginPct1, v => fmtPct(v * 100))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nd(node.marginPct2, v => fmtPct(v * 100))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function HierarchicalMixTable({ effects }: { effects: EffectsResult }) {
  const [expandedCats,   setExpandedCats]   = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());

  const data = useMemo(() => buildHierarchicalMixData(effects), [effects]);
  const totalMixContrib = data.reduce((s, c) => s + c.mixContrib, 0);

  const toggleCat = (cat: string) => setExpandedCats(prev => {
    const s = new Set(prev); s.has(cat) ? s.delete(cat) : s.add(cat); return s;
  });
  const toggleBrand = (key: string) => setExpandedBrands(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
  });

  const balanceOk = Math.abs(totalMixContrib - effects.effMix) < 1e-6;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Scomposizione Mix Gerarchica</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          L1: Categoria · L2: Brand (espandi ▶) · L3: Referenza con Eff. Prezzo e Eff. Costo (solo effetti reali sulla singola referenza)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide">Categoria</th>
              <th className="px-4 py-2.5 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">Contributo Mix Categoria</th>
              <th className="px-4 py-2.5 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P1</th>
              <th className="px-4 py-2.5 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wide">M% P2</th>
            </tr>
          </thead>
          <tbody>
            {data.map(cat => (
              <CategoriaRow
                key={cat.categoria}
                node={cat}
                expanded={expandedCats.has(cat.categoria)}
                onToggle={() => toggleCat(cat.categoria)}
                expandedBrands={expandedBrands}
                onToggleBrand={toggleBrand}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 border-slate-300 text-xs font-bold ${totalMixContrib >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <td className="px-4 py-2.5 text-slate-800">TOTALE MIX</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${clrPp(totalMixContrib)}`}>{fmtPp(totalMixContrib)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(effects.marginPctP1 * 100)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(effects.marginPctP2 * 100)}</td>
            </tr>
            <tr className="bg-blue-50/40 text-[9px] border-t border-blue-100">
              <td colSpan={4} className="px-4 py-1.5 text-slate-500">
                Σ Mix Categoria = {fmtPp(totalMixContrib)} · Eff. Mix totale = {fmtPp(effects.effMix)}{' '}
                {balanceOk
                  ? <span className="text-emerald-600 font-bold">✓</span>
                  : <span className="text-red-500 font-bold">⚠ diff {((totalMixContrib - effects.effMix) * 100).toFixed(4)} pp</span>
                }
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Waterfall tooltip ────────────────────────────────────────────────────────

function WfTooltip({ active, payload }: { active?: boolean; payload?: { payload?: WaterfallPoint }[] }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs min-w-44">
      <p className="font-semibold text-slate-800 mb-1.5">{pt.name}</p>
      <p className={pt.isTotal ? 'text-blue-600 font-bold' : pt.rawValue >= 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
        {pt.isTotal ? fmtEur.format(pt.rawValue) : `${pt.rawValue >= 0 ? '+' : ''}${pt.rawValue.toFixed(2)}`}
      </p>
    </div>
  );
}

function WfTooltipEur({ active, payload }: { active?: boolean; payload?: { payload?: WaterfallPoint }[] }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs min-w-44">
      <p className="font-semibold text-slate-800 mb-1.5">{pt.name}</p>
      <p className={pt.isTotal ? 'text-blue-600 font-bold' : pt.rawValue >= 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
        {pt.isTotal ? fmtEur.format(pt.rawValue) : fmtDiff(pt.rawValue)}
      </p>
    </div>
  );
}

// ─── Waterfall chart ──────────────────────────────────────────────────────────

type WfLabelProps = { x?: number | string; y?: number | string; width?: number | string; index?: number };

// p1Base: if provided, bar labels are formatted as % of that base value
function makeWfLabel(
  data: WaterfallPoint[],
  type: 'total' | 'green' | 'red',
  yFmt: (v: number) => string,
  p1Base?: number,
) {
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v / (p1Base ?? 1) * 100).toFixed(1)}%`;
  return function WfBarLabel({ x, y, width, index }: WfLabelProps) {
    const pt = data[index ?? 0];
    if (!pt) return null;
    if (type === 'total' && !pt.isTotal) return null;
    if (type === 'green' && pt.green === 0) return null;
    if (type === 'red'   && pt.red   === 0) return null;

    const cx = +(x ?? 0) + +(width ?? 0) / 2;
    const cy = +(y ?? 0) - 5;
    let label: string;
    let fill: string;
    if (type === 'total') {
      label = p1Base ? (pt.name === 'P1' ? '100%' : pct(pt.rawValue - p1Base)) : yFmt(pt.rawValue);
      fill  = '#2563eb';
    } else if (type === 'green') {
      label = p1Base ? pct(pt.rawValue) : `+${yFmt(pt.rawValue)}`;
      fill  = '#059669';
    } else {
      label = p1Base ? pct(pt.rawValue) : `-${yFmt(Math.abs(pt.rawValue))}`;
      fill  = '#ef4444';
    }
    return (
      <text x={cx} y={cy} textAnchor="middle" fontSize={9} fill={fill} fontWeight={600}>
        {label}
      </text>
    );
  };
}

function WaterfallChart({
  data, title, subtitle, yFmt, tooltip, barLabelAsPct,
}: {
  data: WaterfallPoint[];
  title: string;
  subtitle: string;
  yFmt: (v: number) => string;
  tooltip: React.ComponentType<{ active?: boolean; payload?: { payload?: WaterfallPoint }[] }>;
  barLabelAsPct?: boolean;
}) {
  const TooltipComp = tooltip;
  const p1Base = barLabelAsPct ? data.find(d => d.name === 'P1')?.rawValue : undefined;
  const LabelTotal = makeWfLabel(data, 'total', yFmt, p1Base);
  const LabelGreen = makeWfLabel(data, 'green', yFmt, p1Base);
  const LabelRed   = makeWfLabel(data, 'red',   yFmt, p1Base);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex gap-4 mb-4 flex-wrap">
        {[
          { color: 'bg-blue-500', label: 'P1 / P2' },
          { color: 'bg-emerald-500', label: 'Positivo' },
          { color: 'bg-red-400', label: 'Negativo' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-3 h-3 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 22, right: 10, bottom: 5, left: 10 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={(props) => <TooltipComp active={props.active} payload={props.payload as unknown as { payload?: WaterfallPoint }[]} />} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey="spacer" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="total"  stackId="wf" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList content={LabelTotal} />
          </Bar>
          <Bar dataKey="green"  stackId="wf" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList content={LabelGreen} />
          </Bar>
          <Bar dataKey="red"    stackId="wf" fill="#f87171" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList content={LabelRed} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, v1, v2, fmt, subtitle }: {
  label: string; v1: number; v2: number;
  fmt: (n: number) => string; subtitle?: string;
}) {
  const delta = v2 - v1;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-xl font-bold text-blue-600 tabular-nums leading-none mb-1">{fmt(v2)}</p>
      <p className="text-[11px] text-slate-400">P1: {fmt(v1)}</p>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      <p className={`text-xs font-semibold mt-2 tabular-nums ${clrPp(delta)}`}>
        {delta >= 0 ? '+' : ''}{fmt(delta)}
      </p>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: AIInsight }) {
  const colors = {
    positive: 'border-emerald-200 bg-emerald-50',
    negative: 'border-red-200 bg-red-50',
    neutral:  'border-blue-200 bg-blue-50',
  };
  const titleColors = {
    positive: 'text-emerald-700',
    negative: 'text-red-700',
    neutral:  'text-blue-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[insight.type]}`}>
      <p className={`text-xs font-bold mb-1.5 ${titleColors[insight.type]}`}>{insight.title}</p>
      <p className="text-xs text-slate-600 leading-relaxed">{insight.text}</p>
    </div>
  );
}

// ─── Driver Card ──────────────────────────────────────────────────────────────

function DriverCard({ line, rank }: { line: ComparedLine; rank: number }) {
  const delta = line.deltaMarginPct ?? 0;
  const relVar = line.marginPct1 !== null && line.marginPct1 !== 0
    ? delta / Math.abs(line.marginPct1) * 100
    : null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">#{rank}</span>
        <span className={`text-sm font-bold tabular-nums ${clrPp(delta)}`}>{fmtPp(delta)}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-2 truncate" title={line.descrizione || line.key}>
        {line.descrizione || line.key}
      </p>
      <div className="space-y-1 text-[10px] text-slate-500">
        {line.brand        && <p><span className="font-medium">Brand:</span> {line.brand}</p>}
        {line.categoria    && <p><span className="font-medium">Categoria:</span> {line.categoria}</p>}
        {line.sottocategoria && <p><span className="font-medium">Sub:</span> {line.sottocategoria}</p>}
        {line.formato      && <p><span className="font-medium">Formato:</span> {line.formato}</p>}
        <div className="flex gap-3 pt-1">
          <p><span className="font-medium">M% P1:</span> {nd(line.marginPct1, v => fmtPct(v * 100))}</p>
          <p><span className="font-medium">M% P2:</span> {nd(line.marginPct2, v => fmtPct(v * 100))}</p>
          {relVar !== null && <p><span className="font-medium">Var:</span> {relVar.toFixed(1)}%</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Presence badge ───────────────────────────────────────────────────────────

function PresenceBadge({ presence }: { presence: 'both' | 'onlyP1' | 'onlyP2' | 'mixed' }) {
  if (presence === 'onlyP2')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 whitespace-nowrap">Nuovo in P2</span>;
  if (presence === 'onlyP1')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-600 whitespace-nowrap">Uscito in P2</span>;
  return null;
}

// ─── Effects table row ────────────────────────────────────────────────────────
// Columns: Brand | Categoria | Sottocategoria | M% P1 | Delta M% Gruppo
//          | Eff. VolMix | Eff. Prezzo | Eff. Costo | Eff. P+C | M% P2 | Stato
//
// "Delta M% Gruppo" = M% P2 − M% P1 (osservato, non un effetto).
// Identity: Delta = VolMix + Prezzo + Costo (= Eff. P+C + VolMix).
// "Eff. P+C"        = effPrezzo + effCosto.

function EffectsTableRow({
  group, expanded, onToggle,
}: {
  group: TableGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Always expandable: even single-SKU groups show the reference code/description on expand
  const hasChildren = group.lines.length > 0;

  // For pure onlyP1/P2 groups, price/cost effects are 0 by construction (not meaningful)
  const isPureOneSide = group.presence === 'onlyP1' || group.presence === 'onlyP2';

  // Effetto P+C: somma degli effetti spiegati dal modello a livello gruppo
  const effPC = (!isPureOneSide && group.effPrezzo !== null && group.effCosto !== null)
    ? group.effPrezzo + group.effCosto : null;

  return (
    <>
      <tr
        className={`hover:bg-slate-50 transition-colors border-b border-slate-100 ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        {/* Brand */}
        <td className="px-4 py-3 text-xs font-medium text-slate-700">
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              expanded
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
            {group.brand || '—'}
          </div>
        </td>
        {/* Categoria */}
        <td className="px-4 py-3 text-xs text-slate-600">{group.categoria || '—'}</td>
        {/* Sottocategoria */}
        <td className="px-4 py-3 text-xs text-slate-500">{group.sottocategoria || '—'}</td>
        {/* M% P1 */}
        <td className="px-4 py-3 text-xs tabular-nums text-slate-700 text-right">
          {nd(group.marginPct1, v => fmtPct(v * 100))}
        </td>
        {/* Delta M% Gruppo = M%P2 − M%P1 (osservato) */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-semibold ${group.effTotale !== null ? clrPp(group.effTotale) : 'text-slate-400'}`}>
          {group.effTotale !== null ? fmtPp(group.effTotale) : 'N/D'}
        </td>
        {/* Eff. VolMix */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-medium ${!isPureOneSide && group.effVolMix !== null ? clrPp(group.effVolMix) : 'text-slate-300'}`}>
          {isPureOneSide ? fmtPp(0) : group.effVolMix !== null ? fmtPp(group.effVolMix) : 'N/D'}
        </td>
        {/* Eff. Prezzo — 0.00 pp per gruppi presenti in un solo periodo */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-medium ${!isPureOneSide && group.effPrezzo !== null ? clrPp(group.effPrezzo) : 'text-slate-300'}`}>
          {isPureOneSide ? fmtPp(0) : group.effPrezzo !== null ? fmtPp(group.effPrezzo) : 'N/D'}
        </td>
        {/* Eff. Costo */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-medium ${!isPureOneSide && group.effCosto !== null ? clrPp(group.effCosto) : 'text-slate-300'}`}>
          {isPureOneSide ? fmtPp(0) : group.effCosto !== null ? fmtPp(group.effCosto) : 'N/D'}
        </td>
        {/* Eff. P+C */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-bold ${effPC !== null ? clrPp(effPC) : 'text-slate-300'}`}>
          {effPC !== null ? fmtPp(effPC) : isPureOneSide ? fmtPp(0) : '—'}
        </td>
        {/* M% P2 */}
        <td className="px-4 py-3 text-xs tabular-nums text-slate-700 text-right">
          {nd(group.marginPct2, v => fmtPct(v * 100))}
        </td>
        {/* Stato */}
        <td className="px-4 py-3 text-center">
          <PresenceBadge presence={group.presence} />
        </td>
      </tr>
      {expanded && group.lines.map(l => (
        <tr key={l.key} className="bg-slate-50/60 border-b border-slate-50 text-[10px]">
          {/* Codice (colSpan 2) */}
          <td className="px-4 py-2 pl-8 text-slate-500 font-mono" colSpan={2}>{l.codice}</td>
          {/* Descrizione + badge */}
          <td className="px-4 py-2 text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="truncate max-w-28" title={l.descrizione}>{l.descrizione}</span>
              <PresenceBadge presence={l.presence} />
            </div>
          </td>
          {/* M% P1 — N/D se onlyP2 */}
          <td className="px-4 py-2 tabular-nums text-right text-slate-500">
            {l.isOnlyP2 ? <span className="text-slate-400">N/D</span> : nd(l.marginPct1, v => fmtPct(v * 100))}
          </td>
          {/* Delta M% individuale */}
          <td className={`px-4 py-2 tabular-nums text-right font-semibold ${l.deltaMarginPct !== null ? clrPp(l.deltaMarginPct) : 'text-slate-400'}`}>
            {l.deltaMarginPct !== null ? fmtPp(l.deltaMarginPct) : 'N/D'}
          </td>
          {/* Eff. VolMix / Prezzo / Costo / P+C — non significativi a livello singola referenza */}
          <td className="px-4 py-2 tabular-nums text-right text-slate-300" colSpan={4}>—</td>
          {/* M% P2 — N/D se onlyP1 */}
          <td className="px-4 py-2 tabular-nums text-right text-slate-500">
            {l.isOnlyP1 ? <span className="text-slate-400">N/D</span> : nd(l.marginPct2, v => fmtPct(v * 100))}
          </td>
          {/* Stato */}
          <td className="px-4 py-2 text-center">
            <PresenceBadge presence={l.presence} />
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Verifica row ─────────────────────────────────────────────────────────────

function VerifyRow({ group }: { group: TableGroup }) {
  const ok1 = group.rev1 > 0
    ? Math.abs((group.rev1 - group.cost1) - group.margin1) < 0.01 &&
      group.marginPct1 !== null &&
      Math.abs(group.margin1 / group.rev1 - group.marginPct1) < 0.001
    : true;
  const ok2 = group.rev2 > 0
    ? Math.abs((group.rev2 - group.cost2) - group.margin2) < 0.01 &&
      group.marginPct2 !== null &&
      Math.abs(group.margin2 / group.rev2 - group.marginPct2) < 0.001
    : true;
  const allOk = ok1 && ok2;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 text-xs">
      <td className="px-4 py-3 text-slate-700 font-medium">{group.categoria || group.brand || group.key}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1 > 0 ? fmtEur.format(group.rev1) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1 > 0 ? fmtEur.format(group.cost1) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1 > 0 ? fmtEur.format(group.margin1) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct1, v => fmtPct(v * 100))}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2 > 0 ? fmtEur.format(group.rev2) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2 > 0 ? fmtEur.format(group.cost2) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2 > 0 ? fmtEur.format(group.margin2) : 'N/D'}</td>
      <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct2, v => fmtPct(v * 100))}</td>
      <td className={`px-4 py-3 tabular-nums text-right font-semibold ${group.marginPct1 !== null && group.marginPct2 !== null ? clrPp(group.marginPct2 - group.marginPct1) : 'text-slate-400'}`}>
        {group.marginPct1 !== null && group.marginPct2 !== null ? fmtPp(group.marginPct2 - group.marginPct1) : 'N/D'}
      </td>
      <td className="px-4 py-3 text-center">
        {allOk
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
          : <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
        }
      </td>
    </tr>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
// "Contributo a ΔM%" = margin€P2_cat/totalRev2 - margin€P1_cat/totalRev1
// Somma su tutti i gruppi = marginPctP2 - marginPctP1 (quadratura garantita).

function DetailTableRow({ group, expanded, onToggle, isGrouped, totalRev1, totalRev2 }: {
  group: TableGroup; expanded: boolean; onToggle: () => void; isGrouped: boolean;
  totalRev1: number; totalRev2: number;
}) {
  const hasChildren = isGrouped && group.lines.length > 0;

  const contributo = (totalRev2 > 0 ? group.margin2 / totalRev2 : 0)
                   - (totalRev1 > 0 ? group.margin1 / totalRev1 : 0);

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors text-xs ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        <td className="px-4 py-3 text-slate-700 font-medium">
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              expanded
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
            {isGrouped
              ? `${group.categoria || group.brand || group.key}${group.lines.length > 1 ? ` — ${group.lines.length} prodotti` : ''}`
              : (group.lines[0]?.descrizione || group.key)
            }
          </div>
        </td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1  > 0 ? fmtEur.format(group.rev1) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1  > 0 ? fmtEur.format(group.cost1) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct1, v => fmtPct(v * 100))}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2  > 0 ? fmtEur.format(group.rev2) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2  > 0 ? fmtEur.format(group.cost2) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct2, v => fmtPct(v * 100))}</td>
        {/* Contributo a ΔM% — pesato su fatturato totale, si somma al delta globale */}
        <td className={`px-4 py-3 tabular-nums text-right font-semibold ${clrPp(contributo)}`}>
          {fmtPp(contributo)}
        </td>
        <td className="px-4 py-3 text-center">
          {contributo > 0
            ? <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto" />
            : contributo < 0
              ? <TrendingDown className="w-4 h-4 text-red-400 mx-auto" />
              : <span className="text-slate-400 text-xs">—</span>
          }
        </td>
      </tr>
      {expanded && group.lines.map(l => {
        const lContrib = (totalRev2 > 0 ? l.margin2 / totalRev2 : 0)
                       - (totalRev1 > 0 ? l.margin1 / totalRev1 : 0);
        return (
          <tr key={l.key} className="bg-slate-50/60 border-b border-slate-50 text-[10px]">
            <td className="px-4 py-2 pl-9 text-slate-500">
              <div className="flex items-center gap-1.5">
                <span>{l.descrizione || l.codice}</span>
                <PresenceBadge presence={l.presence} />
              </div>
            </td>
            {/* P1: N/D se onlyP2 */}
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP2 ? <span className="text-slate-300">N/D</span> : (l.rev1 > 0 ? fmtEur.format(l.rev1) : '—')}
            </td>
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP2 ? <span className="text-slate-300">N/D</span> : (l.rev1 > 0 ? fmtEur.format(l.cost1) : '—')}
            </td>
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP2 ? <span className="text-slate-300">N/D</span> : nd(l.marginPct1, v => fmtPct(v * 100))}
            </td>
            {/* P2: N/D se onlyP1 */}
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP1 ? <span className="text-slate-300">N/D</span> : (l.rev2 > 0 ? fmtEur.format(l.rev2) : '—')}
            </td>
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP1 ? <span className="text-slate-300">N/D</span> : (l.rev2 > 0 ? fmtEur.format(l.cost2) : '—')}
            </td>
            <td className="px-4 py-2 tabular-nums text-right text-slate-400">
              {l.isOnlyP1 ? <span className="text-slate-300">N/D</span> : nd(l.marginPct2, v => fmtPct(v * 100))}
            </td>
            <td className={`px-4 py-2 tabular-nums text-right font-semibold ${clrPp(lContrib)}`}>
              {fmtPp(lContrib)}
            </td>
            <td className="px-4 py-2 text-center text-slate-300">—</td>
          </tr>
        );
      })}
    </>
  );
}

// ─── Technical Calculation Table (Admin only) ────────────────────────────────

type TechSortKey =
  | 'codice' | 'presenza'
  | 'p1Raw' | 'p1Eff' | 'p2Raw' | 'p2Eff'
  | 'c1Raw' | 'c1Eff' | 'c2Raw' | 'c2Eff'
  | 'm1' | 'm2' | 'mix1' | 'mix2';

function TechSortTh({
  col, label, sortKey, sortDir, onSort,
}: {
  col: TechSortKey; label: string;
  sortKey: TechSortKey; sortDir: 'asc' | 'desc';
  onSort: (col: TechSortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-600 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function TechnicalCalcTable({
  lines, totalRev1, totalRev2,
}: {
  lines: ComparedLine[];
  totalRev1: number;
  totalRev2: number;
}) {
  const [search,  setSearch]  = useState('');
  const [sortKey, setSortKey] = useState<TechSortKey>('codice');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(col: TechSortKey) {
    if (sortKey === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  }

  const fmtPrice = (v: number | null) =>
    v === null ? 'N/D' : `€${v.toFixed(4)}`;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return lines;
    return lines.filter(l =>
      l.codice.toLowerCase().includes(q) || l.descrizione.toLowerCase().includes(q),
    );
  }, [lines, search]);

  const sorted = useMemo(() => {
    const getValue = (l: ComparedLine): number | string => {
      switch (sortKey) {
        case 'codice':   return l.codice;
        case 'presenza': return l.presence;
        case 'p1Raw':    return l.price1Raw    ?? -Infinity;
        case 'p1Eff':    return l.price1Effective;
        case 'p2Raw':    return l.price2Raw    ?? -Infinity;
        case 'p2Eff':    return l.price2Effective;
        case 'c1Raw':    return l.unitCost1Raw ?? -Infinity;
        case 'c1Eff':    return l.unitCost1Effective;
        case 'c2Raw':    return l.unitCost2Raw ?? -Infinity;
        case 'c2Eff':    return l.unitCost2Effective;
        case 'm1':       return l.marginPct1Raw ?? -Infinity;
        case 'm2':       return l.marginPct2Raw ?? -Infinity;
        case 'mix1':     return totalRev1 > 0 ? l.rev1 / totalRev1 : 0;
        case 'mix2':     return totalRev2 > 0 ? l.rev2 / totalRev2 : 0;
        default:         return '';
      }
    };
    return [...filtered].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, totalRev1, totalRev2]);

  const sortProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Tabella Tecnica di Calcolo</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Valori effettivi usati dal motore di calcolo per ogni referenza
          </p>
        </div>
        <input
          type="text"
          placeholder="Filtra per codice / descrizione…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-blue-200 shrink-0"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1480 }}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <TechSortTh col="codice"   label="Codice / Descrizione" {...sortProps} />
              <TechSortTh col="presenza" label="Presenza"             {...sortProps} />
              <TechSortTh col="p1Raw"    label="Price P1 raw"         {...sortProps} />
              <TechSortTh col="p1Eff"    label="Price P1 eff"         {...sortProps} />
              <TechSortTh col="p2Raw"    label="Price P2 raw"         {...sortProps} />
              <TechSortTh col="p2Eff"    label="Price P2 eff"         {...sortProps} />
              <TechSortTh col="c1Raw"    label="Costo P1 raw"         {...sortProps} />
              <TechSortTh col="c1Eff"    label="Costo P1 eff"         {...sortProps} />
              <TechSortTh col="c2Raw"    label="Costo P2 raw"         {...sortProps} />
              <TechSortTh col="c2Eff"    label="Costo P2 eff"         {...sortProps} />
              <TechSortTh col="m1"       label="M% P1 raw"            {...sortProps} />
              <TechSortTh col="m2"       label="M% P2 raw"            {...sortProps} />
              <TechSortTh col="mix1"     label="Mix P1 %"             {...sortProps} />
              <TechSortTh col="mix2"     label="Mix P2 %"             {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-6 py-8 text-center text-xs text-slate-400">
                  Nessuna referenza trovata.
                </td>
              </tr>
            ) : sorted.map(l => {
              const mix1pct = totalRev1 > 0 ? (l.rev1 / totalRev1 * 100) : 0;
              const mix2pct = totalRev2 > 0 ? (l.rev2 / totalRev2 * 100) : 0;
              const p1Fb = l.flags.priceFallback && l.price1Raw === null;
              const p2Fb = l.flags.priceFallback && l.price2Raw === null;
              const c1Fb = l.flags.costFallback  && l.unitCost1Raw === null;
              const c2Fb = l.flags.costFallback  && l.unitCost2Raw === null;

              const presence = l.presence as 'both' | 'onlyP1' | 'onlyP2';

              return (
                <tr key={l.key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  {/* 1. Codice / Descrizione */}
                  <td className="px-3 py-2">
                    <div className="font-mono text-slate-400 text-[9px] leading-none">{l.codice}</div>
                    <div className="text-slate-700 text-[10px] max-w-[180px] truncate mt-0.5" title={l.descrizione}>
                      {l.descrizione || '—'}
                    </div>
                  </td>

                  {/* 2. Presenza */}
                  <td className="px-3 py-2">
                    {presence === 'onlyP2'
                      ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 whitespace-nowrap">Nuovo in P2</span>
                      : presence === 'onlyP1'
                        ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 whitespace-nowrap">Uscito in P2</span>
                        : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap">Entrambi</span>
                    }
                  </td>

                  {/* 3. Price P1 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-500">
                    {fmtPrice(l.price1Raw)}
                  </td>

                  {/* 4. Price P1 eff */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-700 font-medium">
                    {fmtPrice(l.price1Effective)}
                    {p1Fb && <sup className="text-amber-500 font-bold ml-0.5">*</sup>}
                  </td>

                  {/* 5. Price P2 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-500">
                    {fmtPrice(l.price2Raw)}
                  </td>

                  {/* 6. Price P2 eff */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-700 font-medium">
                    {fmtPrice(l.price2Effective)}
                    {p2Fb && <sup className="text-amber-500 font-bold ml-0.5">*</sup>}
                  </td>

                  {/* 7. Costo P1 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-500">
                    {fmtPrice(l.unitCost1Raw)}
                  </td>

                  {/* 8. Costo P1 eff */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-700 font-medium">
                    {fmtPrice(l.unitCost1Effective)}
                    {c1Fb && <sup className="text-amber-500 font-bold ml-0.5">*</sup>}
                  </td>

                  {/* 9. Costo P2 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-500">
                    {fmtPrice(l.unitCost2Raw)}
                  </td>

                  {/* 10. Costo P2 eff */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-700 font-medium">
                    {fmtPrice(l.unitCost2Effective)}
                    {c2Fb && <sup className="text-amber-500 font-bold ml-0.5">*</sup>}
                  </td>

                  {/* 11. M% P1 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-600">
                    {l.marginPct1Raw !== null ? fmtPct(l.marginPct1Raw * 100) : 'N/D'}
                  </td>

                  {/* 12. M% P2 raw */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-600">
                    {l.marginPct2Raw !== null ? fmtPct(l.marginPct2Raw * 100) : 'N/D'}
                  </td>

                  {/* 13. Mix P1 % */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-600">
                    {mix1pct.toFixed(2)}%
                  </td>

                  {/* 14. Mix P2 % */}
                  <td className="px-3 py-2 tabular-nums text-right text-[10px] text-slate-600">
                    {mix2pct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
        <p className="text-[10px] text-slate-400">
          <sup className="text-amber-500 font-bold">*</sup>
          {' '}= valore sostituito con fallback dal periodo opposto perché mancante o zero
        </p>
      </div>
    </div>
  );
}



// ─── Main component ───────────────────────────────────────────────────────────

export default function VarianceAnalysis() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── Upload state ────────────────────────────────────────────────────────────
  const [rows, setRows]               = useState<VarRow[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const uploadRef                     = useRef<HTMLInputElement>(null);
  const pdfRef                        = useRef<HTMLDivElement>(null);

  // ── Period / filter state ───────────────────────────────────────────────────
  const [p1Keys, setP1Keys]           = useState<string[]>([]);
  const [p2Keys, setP2Keys]           = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Partial<Record<FilterDim, string[]>>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDetail, setExpandedDetail] = useState<Set<string>>(new Set());
  const [detailView, setDetailView]   = useState<'grouped' | 'lista'>('grouped');
  const [verifyView, setVerifyView]   = useState<'grouped' | 'lista'>('grouped');

  // ── AI comment + consultant note ────────────────────────────────────────────
  const [aiComment, setAiComment]       = useState<string | null>(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);
  const [consultantNote, setConsultantNote] = useState('');

  // ── Derived ─────────────────────────────────────────────────────────────────
  const periods     = useMemo(() => rows ? extractPeriods(rows) : [], [rows]);
  const filterOpts  = useMemo(() => rows ? extractFilterOptions(rows) : null, [rows]);
  const activeDims  = useMemo(() =>
    filterOpts ? FILTER_DIMS.filter(d => filterOpts[d].length > 0) : [],
  [filterOpts]);

  const rowsP1 = useMemo(() =>
    rows && p1Keys.length > 0 ? filterRowsByPeriodAndFilters(rows, p1Keys, activeFilters) : [],
  [rows, p1Keys, activeFilters]);

  const rowsP2 = useMemo(() =>
    rows && p2Keys.length > 0 ? filterRowsByPeriodAndFilters(rows, p2Keys, activeFilters) : [],
  [rows, p2Keys, activeFilters]);

  const effects: EffectsResult | null = useMemo(() =>
    rowsP1.length > 0 && rowsP2.length > 0
      ? computeVarianceEffects(rowsP1, rowsP2)
      : null,
  [rowsP1, rowsP2]);

  const insights = useMemo(() => effects ? generateInsights(effects) : [], [effects]);

  // ── AI comment: chiave localStorage + chiamata API ───────────────────────────
  const noteKey = useMemo(
    () => `marginview_variance_note_${[...p1Keys].sort().join(',')}_vs_${[...p2Keys].sort().join(',')}`,
    [p1Keys, p2Keys],
  );

  useEffect(() => {
    setConsultantNote(localStorage.getItem(noteKey) ?? '');
  }, [noteKey]);

  useEffect(() => {
    if (!effects) {
      setAiComment(null);
      setAiError(null);
      return;
    }
    const ctrl = new AbortController();
    setAiLoading(true);
    setAiComment(null);
    setAiError(null);
    const delta = effects.marginPctP2 - effects.marginPctP1;
    fetch('/api/ai-comment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body:    JSON.stringify({
        module: 'varianza',
        data: {
          marginPctP1:    effects.marginPctP1,
          marginPctP2:    effects.marginPctP2,
          varianzaTotale: delta,
          effVolume:      effects.effVolume,
          effMix:         effects.effMix,
          effPrezzo:      effects.effPrezzo,
          effCosto:       effects.effCosto,
          totalRev1:      effects.totalRev1,
          totalRev2:      effects.totalRev2,
          totalMargin1:   effects.totalMargin1,
          totalMargin2:   effects.totalMargin2,
        },
      }),
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(d => { if (d.comment) setAiComment(d.comment); else if (d.error) setAiError(d.error); })
      .catch(e => { if (e.name !== 'AbortError') setAiError('Impossibile generare il commento AI.'); })
      .finally(() => setAiLoading(false));
    return () => ctrl.abort();
  }, [effects, token]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const ab  = await file.arrayBuffer();
      const wb  = XLSX.read(ab);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      const parsed = parseExcelToVarRows(raw);
      if (parsed.length === 0) { alert('Nessuna riga valida trovata nel file. Controlla il formato.'); return; }
      setRows(parsed);
      setP1Keys([]);
      setP2Keys([]);
      setActiveFilters({});
      setExpandedGroups(new Set());
      setExpandedDetail(new Set());
    } catch { alert('Errore lettura file. Assicurati che sia un file Excel valido.'); }
    finally { setLoading(false); }
  }, []);

  const togglePeriod = (key: string, which: 'p1' | 'p2') => {
    const setter = which === 'p1' ? setP1Keys : setP2Keys;
    setter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleFilter = (dim: FilterDim, val: string) => {
    setActiveFilters(prev => {
      const cur = prev[dim] ?? [];
      const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
      return { ...prev, [dim]: next };
    });
  };

  const clearFilters = () => setActiveFilters({});

  const toggleGroup  = (key: string) => setExpandedGroups(prev  => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  const toggleDetail = (key: string) => setExpandedDetail(prev  => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE 1 — UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────
  if (!rows) {
    return (
      <div className="min-h-full flex flex-col bg-slate-50">
        <div className="px-8 pt-8 pb-2 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Varianza Marginalità</h1>
            <p className="text-xs text-slate-500">Waterfall analysis Δ Margine</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div
            className={`w-full max-w-[600px] border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-colors bg-white ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => uploadRef.current?.click()}
          >
            {loading
              ? <Loader2 className="w-10 h-10 mx-auto text-blue-500 mb-5 animate-spin" />
              : <Upload className="w-10 h-10 mx-auto text-slate-400 mb-5" />
            }
            <h2 className="text-base font-bold text-slate-800 mb-2">
              {loading ? 'Caricamento in corso…' : 'Carica il file Excel'}
            </h2>
            {!loading && (
              <>
                <p className="text-sm text-slate-500">
                  Colonne: Codice Materiale, Descrizione, Anno, Mese, Quantità, Fatturato, Costo Unitario
                </p>
                <p className="text-sm text-slate-500 mt-1.5">
                  + colonne opzionali (rilevate da intestazione): <strong className="text-slate-700">Brand</strong>, <strong className="text-slate-700">Categoria</strong>, Sottocategoria, Formato, Paese/Canale
                </p>
                <p className="text-sm text-slate-400 mt-4">Trascina qui o clicca per selezionare (.xlsx, .xls)</p>
              </>
            )}
            <input
              ref={uploadRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATES 2 + 3 — FILTERS + RESULTS
  // ─────────────────────────────────────────────────────────────────────────────

  const hasActiveFilters = FILTER_DIMS.some(d => (activeFilters[d]?.length ?? 0) > 0);
  const canShowResults   = p1Keys.length > 0 && p2Keys.length > 0;

  return (
    <div className="min-h-full bg-slate-50">
      <div ref={pdfRef} className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Analisi Varianze Margini</h1>
            <p className="text-sm text-slate-500">
              Effetti Volume, Mix, Prezzo e Costo sui margini percentuali
            </p>
          </div>
          {canShowResults && (
            <button
              onClick={async () => {
                if (!pdfRef.current || exportingPdf) return;
                setExportingPdf(true);
                try { await exportPDF(pdfRef.current, 'varianza-margini.pdf'); }
                finally { setExportingPdf(false); }
              }}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" /> {exportingPdf ? 'Esportando…' : 'Esporta PDF'}
            </button>
          )}
        </div>

        {/* ── FILTER CARD ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Filter className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-sm font-semibold text-slate-800">Filtri di Analisi</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {rows.length.toLocaleString('it-IT')} righe caricate
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Pulisci Filtri
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Period selectors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(['p1', 'p2'] as const).map(which => {
                const selected = which === 'p1' ? p1Keys : p2Keys;
                return (
                  <div key={which}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Periodo {which === 'p1' ? '1' : '2'}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Selezionati: {selected.length} periodi
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {periods.map(p => {
                        const sel = selected.includes(p.key);
                        return (
                          <button
                            key={p.key}
                            onClick={() => togglePeriod(p.key, which)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                              sel
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dynamic filters */}
            {activeDims.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Filtri Opzionali</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDims.map(dim => {
                    const vals    = filterOpts![dim];
                    const selVals = activeFilters[dim] ?? [];
                    return (
                      <div key={dim} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                          {FILTER_DIM_LABELS[dim]}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {vals.map(v => {
                            const sel = selVals.includes(v);
                            return (
                              <button
                                key={v}
                                onClick={() => toggleFilter(dim, v)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${
                                  sel
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                              >
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warning */}
            {!canShowResults && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Seleziona almeno un periodo per ciascun Periodo 1 e Periodo 2 per visualizzare l'analisi.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── RESULTS ─────────────────────────────────────────────────────────── */}
        {canShowResults && effects && (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Fatturato"
                v1={effects.totalRev1} v2={effects.totalRev2}
                fmt={v => fmtEur.format(v)}
              />
              <KpiCard
                label="Margine €"
                v1={effects.totalMargin1} v2={effects.totalMargin2}
                fmt={v => fmtEur.format(v)}
              />
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Margine % P1</p>
                <p className="text-xl font-bold text-blue-600 tabular-nums leading-none mb-1">
                  {fmtPct(effects.marginPctP1 * 100)}
                </p>
                <p className="text-xs text-slate-400">Margine percentuale iniziale</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Margine % P2</p>
                <p className="text-xl font-bold text-blue-600 tabular-nums leading-none mb-1">
                  {fmtPct(effects.marginPctP2 * 100)}
                </p>
                <p className="text-xs text-slate-400">Margine percentuale finale</p>
                <div className="border-t border-slate-100 mt-2 pt-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Varianza Totale</p>
                  <p className={`text-sm font-bold tabular-nums ${clrPp(effects.marginPctP2 - effects.marginPctP1)}`}>
                    {fmtPp(effects.marginPctP2 - effects.marginPctP1)}
                  </p>
                </div>
              </div>
            </div>

            {/* ── 4 Effetti classici + Varianza Totale ──────────────────────── */}
            {(() => {
              const delta = effects.marginPctP2 - effects.marginPctP1;
              const fmtEff = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}`;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Effetto Volume', v: effects.effVolume },
                      { label: 'Effetto Mix',    v: effects.effMix },
                      { label: 'Effetto Prezzo', v: effects.effPrezzo },
                      { label: 'Effetto Costo',  v: effects.effCosto },
                    ].map(({ label, v }) => (
                      <div key={label} className={`rounded-2xl p-5 border shadow-sm ${v > 0 ? 'bg-emerald-50 border-emerald-200' : v < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
                        <p className={`text-xl font-bold tabular-nums ${clrPp(v)}`}>{fmtPp(v)}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`rounded-2xl p-5 border shadow-sm ${delta > 0 ? 'bg-emerald-50 border-emerald-200' : delta < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Varianza Totale</p>
                        <p className={`text-3xl font-bold tabular-nums ${clrPp(delta)}`}>{fmtPp(delta)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-mono">
                          = Vol ({fmtEff(effects.effVolume)})
                          {' '}+ Mix ({fmtEff(effects.effMix)})
                          {' '}+ Prezzo ({fmtEff(effects.effPrezzo)})
                          {' '}+ Costo ({fmtEff(effects.effCosto)}) pp
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          M% P1 {fmtPct(effects.marginPctP1 * 100)} → M% P2 {fmtPct(effects.marginPctP2 * 100)}
                          {effects.isBalanced ? ' — quadratura ✓' : ` — sbilancio ${(effects.quadratureDiff * 100).toFixed(4)} pp ⚠`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Mix Effect Breakdown ──────────────────────────────────────── */}
            <MixEffectBreakdown effects={effects} />

            {/* ── Commento AI + Note Consulente ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* AI Comment card */}
              <div className="bg-slate-900 rounded-2xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                    <MessageSquareText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Commento AI — Varianza Marginalità</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Generato in tempo reale dai KPI calcolati</p>
                  </div>
                </div>

                <div className="flex-1 min-h-[100px]">
                  {aiLoading && (
                    <div className="space-y-2.5 animate-pulse">
                      {[100, 90, 96, 80, 88].map((w, i) => (
                        <div key={i} className="h-2.5 bg-slate-700 rounded" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  )}
                  {aiError && !aiLoading && (
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{aiError}</span>
                    </div>
                  )}
                  {aiComment && !aiLoading && (
                    <p className="text-sm text-slate-300 leading-relaxed font-light whitespace-pre-line">
                      {aiComment}
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3">
                  {([
                    { label: 'Var. Totale', v: effects.marginPctP2 - effects.marginPctP1 },
                    { label: 'Eff. Volume', v: effects.effVolume },
                    { label: 'Eff. Mix',    v: effects.effMix },
                  ] as { label: string; v: number }[]).map(({ label, v }) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                      <p className={`text-sm font-bold tabular-nums ${clrPp(v)}`}>{fmtPp(v)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consultant note card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <PenLine className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Commento del Consulente</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Considerazioni per il periodo selezionato</p>
                  </div>
                </div>
                <textarea
                  value={consultantNote}
                  onChange={e => {
                    setConsultantNote(e.target.value);
                    localStorage.setItem(noteKey, e.target.value);
                  }}
                  placeholder="Inserisci osservazioni, obiettivi o piani d'azione..."
                  className="flex-1 resize-none rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed placeholder:text-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all min-h-40"
                />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-[10px] text-slate-400">Salvato automaticamente per questo periodo</p>
                  {consultantNote && (
                    <p className="text-[11px] text-slate-400 tabular-nums">{consultantNote.length} car.</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Waterfall Charts ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <WaterfallChart
                data={effects.waterfallRev}
                title="Waterfall — Fatturato"
                subtitle="Contributo per categoria"
                yFmt={v => `€${((v as number) / 1000).toFixed(0)}k`}
                tooltip={WfTooltipEur}
                barLabelAsPct
              />
              <WaterfallChart
                data={effects.waterfallMargin}
                title="Waterfall — Margine €"
                subtitle="Contributo per categoria"
                yFmt={v => `€${((v as number) / 1000).toFixed(0)}k`}
                tooltip={WfTooltipEur}
                barLabelAsPct
              />
              <WaterfallChart
                data={effects.waterfallMarginPct}
                title="Waterfall — Margine %"
                subtitle="Decomposizione Volume / Mix / Prezzo / Costo"
                yFmt={v => `${(v as number).toFixed(1)}%`}
                tooltip={WfTooltip}
              />
            </div>

            {/* ── Analisi degli Effetti ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Analisi degli Effetti</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Decomposizione: Margine % P1 + Effetto Volume + Effetto Mix + Effetto Prezzo + Effetto Costo = Margine % P2
                </p>
              </div>

              <div className="p-6 space-y-5">
                {/* Info box */}
                <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-0.5">Decomposizione calcolata per singola referenza</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      Gli effetti Volume, Mix, Prezzo e Costo sono calcolati referenza per referenza (full outer join P1 ∪ P2),
                      poi aggregati. Prodotti nuovi in P2 (onlyP2) e usciti in P2 (onlyP1) sono inclusi e contribuiscono all'Effetto Mix.
                    </p>
                  </div>
                </div>

                {/* Quadrature check */}
                {!effects.isBalanced && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <p className="font-bold text-amber-700">Attenzione: sbilancio nella quadratura degli effetti</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-amber-700">
                      <p>M% P1: {fmtPct(effects.marginPctP1 * 100)}</p>
                      <p>Eff. Volume: {fmtPp(effects.effVolume)}</p>
                      <p>Eff. Mix: {fmtPp(effects.effMix)}</p>
                      <p>Eff. Prezzo: {fmtPp(effects.effPrezzo)}</p>
                      <p>Eff. Costo: {fmtPp(effects.effCosto)}</p>
                      <p>M% P2 previsto: {fmtPct(effects.expectedP2 * 100)}</p>
                      <p>M% P2 effettivo: {fmtPct(effects.marginPctP2 * 100)}</p>
                      <p className="font-bold">Diff: {(effects.quadratureDiff * 100).toFixed(4)} pp</p>
                    </div>
                  </div>
                )}
                {effects.isBalanced && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Quadratura verificata — la somma degli effetti coincide con ΔM% entro tolleranza (0.1 pp)</span>
                  </div>
                )}

              </div>
            </div>

            {/* ── Variazione Margine % per Gruppo ───────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Variazione Margine % per Gruppo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Delta M% Gruppo = M% P2 − M% P1 (osservato). Delta = VolMix + Prezzo + Costo. Clicca ▶ per il dettaglio referenze.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Brand', 'Categoria', 'Sottocategoria', 'M% P1', 'Delta M% Gruppo', 'Eff. VolMix', 'Eff. Prezzo', 'Eff. Costo', 'Eff. P+C', 'M% P2', 'Stato'].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide text-right first:text-left whitespace-nowrap last:text-center">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {effects.tableGroups.map(g => (
                      <EffectsTableRow
                        key={g.key}
                        group={g}
                        expanded={expandedGroups.has(g.key)}
                        onToggle={() => toggleGroup(g.key)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Insights AI ────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Insights AI — Analisi Strategica</h3>
                <p className="text-xs text-slate-400 mt-0.5">Analisi deterministica basata sui dati calcolati</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
              </div>
            </div>

            {/* ── Top Drivers ────────────────────────────────────────────────── */}
            <div>
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-slate-900">Analisi Top Drivers</h3>
                <p className="text-sm text-slate-500 mt-1">I principali driver di varianza con dettagli completi</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[
                  { title: 'Top 3 Variazioni', items: effects.topVariations, color: 'bg-blue-50 border-blue-200' },
                  { title: 'Top 3 Best Performers', items: effects.topBest, color: 'bg-emerald-50 border-emerald-200' },
                  { title: 'Top 3 Worst Performers', items: effects.topWorst, color: 'bg-red-50 border-red-200' },
                ].map(({ title, items, color }) => (
                  <div key={title} className={`rounded-2xl border p-5 ${color}`}>
                    <h4 className="text-sm font-semibold text-slate-700 mb-4">{title}</h4>
                    {items.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">Nessun dato disponibile</p>
                      : <div className="space-y-3">
                          {items.map((l, i) => <DriverCard key={l.key} line={l} rank={i + 1} />)}
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* ── Verifica Calcoli ───────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Verifica Calcoli Margini</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Controllo correttezza dei calcoli per categorie e sottocategorie</p>
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['grouped', 'lista'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setVerifyView(v)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        verifyView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {v === 'grouped' ? 'Raggruppato' : 'Lista'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Categoria/Sott.</th>
                      {['Fatt. P1','Costi P1','Marg. € P1','M% P1','Fatt. P2','Costi P2','Marg. € P2','M% P2','ΔM%','Verifica'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wide last:text-center whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verifyView === 'grouped'
                      ? effects.tableGroups.map(g => <VerifyRow key={g.key} group={g} />)
                      : effects.lines.map(l => {
                          const mg: TableGroup = {
                            key: l.key, brand: l.brand, categoria: l.categoria,
                            sottocategoria: l.sottocategoria, formato: l.formato,
                            lineCount: 1, presence: l.presence,
                            rev1: l.rev1, cost1: l.cost1, margin1: l.margin1, marginPct1: l.marginPct1,
                            rev2: l.rev2, cost2: l.cost2, margin2: l.margin2, marginPct2: l.marginPct2,
                            effVolMix: null, effPrezzo: null, effCosto: null, effTotale: l.deltaMarginPct,
                            lines: [l],
                          };
                          return <VerifyRow key={l.key} group={mg} />;
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Secondary Charts ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Margin comparison by product line */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h4 className="text-sm font-semibold text-slate-700 mb-1">Margin Comparison by Product Line</h4>
                <p className="text-xs text-slate-400 mb-4">Periodo 1 vs Periodo 2 per linea prodotto</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={effects.tableGroups.slice(0, 10).map(g => ({
                      name: g.categoria || g.brand || g.key,
                      'P1 %': g.marginPct1 !== null ? +(g.marginPct1 * 100).toFixed(2) : 0,
                      'P2 %': g.marginPct2 !== null ? +(g.marginPct2 * 100).toFixed(2) : 0,
                    }))}
                    margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false} tickLine={false} width={40}
                    />
                    <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`]} />
                    <Bar dataKey="P1 %" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="P2 %" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top variance drivers list */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h4 className="text-sm font-semibold text-slate-700 mb-1">Top Variance Drivers</h4>
                <p className="text-xs text-slate-400 mb-4">Driver principali di varianza margine %</p>
                <div className="space-y-2">
                  {[...effects.lines]
                    .filter(l => l.deltaMarginPct !== null)
                    .sort((a, b) => Math.abs(b.deltaMarginPct!) - Math.abs(a.deltaMarginPct!))
                    .slice(0, 8)
                    .map(l => (
                      <div key={l.key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 truncate flex-1 min-w-0" title={l.descrizione || l.key}>
                          {l.descrizione || l.key}
                        </span>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(l.deltaMarginPct ?? 0) >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(Math.abs(l.deltaMarginPct! * 1000), 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums w-20 text-right ${clrPp(l.deltaMarginPct ?? 0)}`}>
                          {fmtPp(l.deltaMarginPct ?? 0)}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

            {/* ── Analisi Dettagliata Varianze ───────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Analisi Dettagliata delle Varianze</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scomposizione completa delle variazioni di margine per linea di prodotto</p>
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['grouped', 'lista'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setDetailView(v)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        detailView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {v === 'grouped' ? 'Raggruppato' : 'Lista'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Linea Prodotto</th>
                      {['Fatt. P1','Costi P1','M% P1','Fatt. P2','Costi P2','M% P2','Contributo a ΔM%','Trend'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wide last:text-center whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailView === 'grouped'
                      ? effects.tableGroups.map(g => (
                          <DetailTableRow
                            key={g.key}
                            group={g}
                            expanded={expandedDetail.has(g.key)}
                            onToggle={() => toggleDetail(g.key)}
                            isGrouped
                            totalRev1={effects.totalRev1}
                            totalRev2={effects.totalRev2}
                          />
                        ))
                      : effects.lines.map(l => {
                          const mg: TableGroup = {
                            key: l.key, brand: l.brand, categoria: l.categoria,
                            sottocategoria: l.sottocategoria, formato: l.formato,
                            lineCount: 1, presence: l.presence,
                            rev1: l.rev1, cost1: l.cost1, margin1: l.margin1, marginPct1: l.marginPct1,
                            rev2: l.rev2, cost2: l.cost2, margin2: l.margin2, marginPct2: l.marginPct2,
                            effVolMix: null, effPrezzo: null, effCosto: null, effTotale: l.deltaMarginPct,
                            lines: [l],
                          };
                          return (
                            <DetailTableRow
                              key={l.key} group={mg} expanded={false} onToggle={() => {}} isGrouped={false}
                              totalRev1={effects.totalRev1} totalRev2={effects.totalRev2}
                            />
                          );
                        })
                    }
                  </tbody>
                  {/* Riga totale — somma contributi = deltaMarginPp (quadratura) */}
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 text-xs font-bold">
                      <td className="px-4 py-3 text-slate-800">TOTALE</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtEur.format(effects.totalRev1)}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtEur.format(effects.totalCost1)}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtPct(effects.marginPctP1 * 100)}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtEur.format(effects.totalRev2)}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtEur.format(effects.totalCost2)}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtPct(effects.marginPctP2 * 100)}</td>
                      <td className={`px-4 py-3 tabular-nums text-right ${clrPp(effects.marginPctP2 - effects.marginPctP1)}`}>
                        {fmtPp(effects.marginPctP2 - effects.marginPctP1)}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Tabella Tecnica di Calcolo (Admin only) ─────────────────────── */}
            {isAdmin && (
              <TechnicalCalcTable
                lines={effects.lines}
                totalRev1={effects.totalRev1}
                totalRev2={effects.totalRev2}
              />
            )}

            {/* ── Scomposizione Mix Gerarchica ──────────────────────────────────── */}
            <HierarchicalMixTable effects={effects} />
          </>
        )}

        {/* ── Load new file button ───────────────────────────────────────────── */}
        <div className="flex justify-center pb-8">
          <button
            onClick={() => { setRows(null); setP1Keys([]); setP2Keys([]); setActiveFilters({}); }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <X className="w-4 h-4" />
            Carica Nuovo File
          </button>
        </div>

      </div>
    </div>
  );
}
