import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Upload, Loader2, FileDown, Filter, AlertTriangle,
  CheckCircle2, TrendingUp, ChevronDown, ChevronRight,
  RotateCcw, X, Info, MessageSquareText, PenLine,
} from 'lucide-react';
import { downloadPDF } from '../lib/exportPDF';
import VariancePDF from '../lib/pdf/VariancePDF';
import {
  parseExcelToVarRows, extractPeriods, extractFilterOptions,
  filterRowsByPeriodAndFilters, computeVarianceEffects,
  FILTER_DIMS, FILTER_DIM_LABELS,
  computeGroupBridge,
} from '../lib/varianceAnalysis';
import type {
  VarRow, FilterDim,
  ComparedLine, WaterfallPoint, EffectsResult,
  GroupBridgeResult,
} from '../lib/varianceAnalysis';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtEur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct = (v: number, dec = 2) => isFinite(v) ? `${v.toFixed(dec)}%` : 'N/D';
const fmtPp  = (v: number) => isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp` : 'N/D';
const fmtDiff = (v: number) => `${v >= 0 ? '+' : ''}${fmtEur.format(v)}`;
const clrPp  = (v: number) => v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-slate-500';

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
          <div key={label} className="flex items-center justify-between px-3 py-2.5 text-xs border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
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

// ─── Category-level driver type ──────────────────────────────────────────────

interface CatDriver {
  categoria: string;
  marginPct1: number | null;
  marginPct2: number | null;
  deltaMarginPct: number | null;
  rev2: number;
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

// ─── Category driver card ─────────────────────────────────────────────────────

function CatDriverCard({ cat, rank }: { cat: CatDriver; rank: number }) {
  const delta = cat.deltaMarginPct ?? 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">#{rank}</span>
        <span className={`text-sm font-bold tabular-nums ${clrPp(delta)}`}>{fmtPp(delta)}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-2 truncate" title={cat.categoria}>
        {cat.categoria}
      </p>
      <div className="flex gap-3 text-[10px] text-slate-500 pt-1">
        <p><span className="font-medium">M% P1:</span> {cat.marginPct1 !== null ? fmtPct(cat.marginPct1 * 100) : 'N/D'}</p>
        <p><span className="font-medium">M% P2:</span> {cat.marginPct2 !== null ? fmtPct(cat.marginPct2 * 100) : 'N/D'}</p>
      </div>
    </div>
  );
}



// ─── HierarchicalBridgeTable ──────────────────────────────────────────────────
// Pivot table: Canale → Brand → Sottocategoria → Formato → Referenza Servizio (5 levels)
// Columns: Cos%P1 | Volume | Mix Brand | Mix Sottocat. | Mix Formato | Mix Ref. | Price | Costo | Cos%P2

interface HierCanaleNode  { canale: string;   bridge: GroupBridgeResult; brands:   HierBrandNode[]   }
interface HierBrandNode   { brand: string;    bridge: GroupBridgeResult; subcats:  HierSubcatNode[]  }
interface HierSubcatNode  { subcat: string;   bridge: GroupBridgeResult; formati:  HierFormatoNode[] }
interface HierFormatoNode { formato: string;  bridge: GroupBridgeResult; referenze: HierLeafNode[]   }
interface HierLeafNode    { referenza: string; label: string; bridge: GroupBridgeResult }

const fmtPctV = (v: number | null) =>
  v === null || !isFinite(v) ? 'N/D' : `${(v * 100).toFixed(2)}%`;

const fmtEff = (v: number) => {
  if (!isFinite(v) || Math.abs(v) < 5e-5) return '0.00%';
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
};

const clrEff = (v: number) =>
  !isFinite(v) || Math.abs(v) < 5e-5
    ? 'text-slate-400'
    : v > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold';

function BridgeCell({ v, alwaysZero = false }: { v: number; alwaysZero?: boolean }) {
  if (alwaysZero) return <td className="px-3 py-2.5 tabular-nums text-right text-slate-300">0.00%</td>;
  return (
    <td className={`px-3 py-2.5 tabular-nums text-right ${clrEff(v)}`}>{fmtEff(v)}</td>
  );
}

function CosPctCell({ v, py = 'py-2.5', size = '' }: { v: number | null; py?: string; size?: string }) {
  return (
    <td className={`px-3 ${py} tabular-nums text-right bg-sky-100 text-slate-900 font-bold ${size}`}>
      {fmtPctV(v)}
    </td>
  );
}

function HierarchicalBridgeTable({
  effects, allLines,
}: {
  effects: EffectsResult;
  allLines: ComparedLine[];
}) {
  const [expandedCanali,  setExpandedCanali]  = useState<Set<string>>(new Set());
  const [expandedBrands,  setExpandedBrands]  = useState<Set<string>>(new Set());
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  const [expandedFormati, setExpandedFormati] = useState<Set<string>>(new Set());

  const toggleCanale = useCallback((c: string) =>
    setExpandedCanali(p  => { const s = new Set(p); s.has(c) ? s.delete(c) : s.add(c); return s; }), []);
  const toggleBrand  = useCallback((b: string) =>
    setExpandedBrands(p  => { const s = new Set(p); s.has(b) ? s.delete(b) : s.add(b); return s; }), []);
  const toggleSubcat = useCallback((k: string) =>
    setExpandedSubcats(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; }), []);
  const toggleFormato = useCallback((k: string) =>
    setExpandedFormati(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; }), []);

  const nodes = useMemo<HierCanaleNode[]>(() => {
    const canaleMap = new Map<string, ComparedLine[]>();
    for (const l of allLines) {
      const cn = l.canale || 'N/D';
      if (!canaleMap.has(cn)) canaleMap.set(cn, []);
      canaleMap.get(cn)!.push(l);
    }
    return [...canaleMap.entries()].map(([canale, cnLines]) => {
      const brandMap = new Map<string, ComparedLine[]>();
      for (const l of cnLines) {
        const b = l.brand || 'N/D';
        if (!brandMap.has(b)) brandMap.set(b, []);
        brandMap.get(b)!.push(l);
      }
      const brands: HierBrandNode[] = [...brandMap.entries()].map(([brand, bLines]) => {
        const scMap = new Map<string, ComparedLine[]>();
        for (const l of bLines) {
          const s = l.sottocategoria || 'N/D';
          if (!scMap.has(s)) scMap.set(s, []);
          scMap.get(s)!.push(l);
        }
        const subcats: HierSubcatNode[] = [...scMap.entries()].map(([subcat, sLines]) => {
          const fmtMap = new Map<string, ComparedLine[]>();
          for (const l of sLines) {
            const f = l.formato || 'N/D';
            if (!fmtMap.has(f)) fmtMap.set(f, []);
            fmtMap.get(f)!.push(l);
          }
          const formati: HierFormatoNode[] = [...fmtMap.entries()].map(([formato, fLines]) => {
            const refMap = new Map<string, ComparedLine[]>();
            for (const l of fLines) {
              const r = l.codice || l.descrizione || 'N/D';
              if (!refMap.has(r)) refMap.set(r, []);
              refMap.get(r)!.push(l);
            }
            const referenze: HierLeafNode[] = [...refMap.entries()].map(([referenza, rLines]) => {
              const first = rLines[0];
              const label = first.codice
                ? `${first.codice}${first.descrizione ? ' — ' + first.descrizione : ''}`
                : first.descrizione || referenza;
              return { referenza, label, bridge: computeGroupBridge(rLines) };
            });
            return { formato, bridge: computeGroupBridge(fLines), referenze };
          });
          return { subcat, bridge: computeGroupBridge(sLines), formati };
        });
        return { brand, bridge: computeGroupBridge(bLines), subcats };
      });
      return { canale, bridge: computeGroupBridge(cnLines), brands };
    });
  }, [allLines]);

  // Default: expand all levels whenever data changes
  useEffect(() => {
    if (!nodes.length) return;
    const canali = new Set<string>();
    const brands = new Set<string>();
    const scats  = new Set<string>();
    const fmts   = new Set<string>();
    for (const { canale, brands: bs } of nodes) {
      canali.add(canale);
      for (const { brand, subcats } of bs) {
        const bKey = `${canale}|${brand}`;
        brands.add(bKey);
        for (const { subcat, formati } of subcats) {
          const scKey = `${bKey}|${subcat}`;
          scats.add(scKey);
          for (const { formato } of formati) {
            fmts.add(`${scKey}|${formato}`);
          }
        }
      }
    }
    setExpandedCanali(canali);
    setExpandedBrands(brands);
    setExpandedSubcats(scats);
    setExpandedFormati(fmts);
  }, [allLines]); // eslint-disable-line react-hooks/exhaustive-deps

  const md = effects.mixDecomposition;

  const COLS = ['Etichette di riga', 'Cos% P1', 'Volume', 'Mix Brand', 'Mix Sottocat.', 'Mix Formato', 'Mix Ref.', 'Price', 'Costo', 'Cos% P2'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[960px]">
        <thead>
          <tr className="border-b-2 border-slate-200">
            {COLS.map(h => {
              const isHighlight = h === 'Cos% P1' || h === 'Cos% P2';
              return (
                <th key={h} className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap text-right first:text-left ${
                  isHighlight ? 'bg-sky-200 text-slate-800' : 'bg-slate-50 text-slate-500'
                }`}>
                  {h}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {nodes.map(({ canale, bridge: cnb, brands }) => {
            const cnExp = expandedCanali.has(canale);
            return (
              <Fragment key={canale}>
                {/* ── Canale row ── */}
                <tr className="bg-slate-950 hover:bg-slate-900 cursor-pointer transition-colors border-b border-slate-700"
                    onClick={() => toggleCanale(canale)}>
                  <td className="px-3 py-3 font-bold text-violet-300 text-[11px] uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      {cnExp ? <ChevronDown className="w-4 h-4 text-violet-400 flex-shrink-0" />
                             : <ChevronRight className="w-4 h-4 text-violet-400 flex-shrink-0" />}
                      {canale}
                    </div>
                  </td>
                  <CosPctCell v={cnb.cosP1} />
                  <BridgeCell v={cnb.effVolume} />
                  <BridgeCell v={cnb.effMixSottocategoria} />
                  <BridgeCell v={0} alwaysZero />
                  <BridgeCell v={cnb.effMixFormato} />
                  <BridgeCell v={cnb.effMixReferenza} />
                  <BridgeCell v={cnb.effPrezzo} />
                  <BridgeCell v={cnb.effCosto} />
                  <CosPctCell v={cnb.cosP2} />
                </tr>

                {/* ── Brand rows ── */}
                {cnExp && brands.map(({ brand, bridge: bb, subcats }) => {
                  const bKey = `${canale}|${brand}`;
                  const bExp = expandedBrands.has(bKey);
                  return (
                    <Fragment key={bKey}>
                      <tr className="bg-slate-800 hover:bg-slate-700 cursor-pointer transition-colors border-b border-slate-600"
                          onClick={() => toggleBrand(bKey)}>
                        <td className="px-3 py-2.5 font-bold text-white">
                          <div className="flex items-center gap-1.5 pl-5">
                            {bExp ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                            {brand}
                          </div>
                        </td>
                        <CosPctCell v={bb.cosP1} />
                        <BridgeCell v={bb.effVolume} />
                        <BridgeCell v={0} alwaysZero />
                        <BridgeCell v={bb.effMixSottocategoria} />
                        <BridgeCell v={bb.effMixFormato} />
                        <BridgeCell v={bb.effMixReferenza} />
                        <BridgeCell v={bb.effPrezzo} />
                        <BridgeCell v={bb.effCosto} />
                        <CosPctCell v={bb.cosP2} />
                      </tr>

                      {/* ── Sottocategoria rows ── */}
                      {bExp && subcats.map(({ subcat, bridge: sb, formati }) => {
                        const scKey = `${bKey}|${subcat}`;
                        const sExp = expandedSubcats.has(scKey);
                        return (
                          <Fragment key={scKey}>
                            <tr className="bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors border-b border-slate-200"
                                onClick={() => toggleSubcat(scKey)}>
                              <td className="px-3 py-2 text-slate-700 font-semibold">
                                <div className="flex items-center gap-1.5 pl-10">
                                  {sExp ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                        : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                                  {subcat}
                                </div>
                              </td>
                              <CosPctCell v={sb.cosP1} py="py-2" />
                              <BridgeCell v={sb.effVolume} />
                              <BridgeCell v={0} alwaysZero />
                              <BridgeCell v={0} alwaysZero />
                              <BridgeCell v={sb.effMixFormato} />
                              <BridgeCell v={sb.effMixReferenza} />
                              <BridgeCell v={sb.effPrezzo} />
                              <BridgeCell v={sb.effCosto} />
                              <CosPctCell v={sb.cosP2} py="py-2" />
                            </tr>

                            {/* ── Formato rows ── */}
                            {sExp && formati.map(({ formato, bridge: fb, referenze }) => {
                              const fmtKey = `${scKey}|${formato}`;
                              const fExp = expandedFormati.has(fmtKey);
                              return (
                                <Fragment key={fmtKey}>
                                  <tr className="bg-white hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100"
                                      onClick={() => toggleFormato(fmtKey)}>
                                    <td className="px-3 py-1.5 text-slate-600">
                                      <div className="flex items-center gap-1.5 pl-16">
                                        {fExp ? <ChevronDown className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                              : <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                                        {formato}
                                      </div>
                                    </td>
                                    <CosPctCell v={fb.cosP1} py="py-1.5" />
                                    <BridgeCell v={fb.effVolume} />
                                    <BridgeCell v={0} alwaysZero />
                                    <BridgeCell v={0} alwaysZero />
                                    <BridgeCell v={0} alwaysZero />
                                    <BridgeCell v={fb.effMixReferenza} />
                                    <BridgeCell v={fb.effPrezzo} />
                                    <BridgeCell v={fb.effCosto} />
                                    <CosPctCell v={fb.cosP2} py="py-1.5" />
                                  </tr>

                                  {/* ── Referenza Servizio (leaf) rows ── */}
                                  {fExp && referenze.map(({ referenza, label, bridge: rb }) => (
                                    <tr key={`${fmtKey}|${referenza}`}
                                        className="bg-slate-50/50 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                      <td className="px-3 py-1 text-slate-400 text-[10px] pl-20 truncate max-w-[240px]" title={label}>{label}</td>
                                      <CosPctCell v={rb.cosP1} py="py-1" size="text-[10px]" />
                                      <BridgeCell v={rb.effVolume} />
                                      <BridgeCell v={0} alwaysZero />
                                      <BridgeCell v={0} alwaysZero />
                                      <BridgeCell v={0} alwaysZero />
                                      <BridgeCell v={0} alwaysZero />
                                      <BridgeCell v={rb.effPrezzo} />
                                      <BridgeCell v={rb.effCosto} />
                                      <CosPctCell v={rb.cosP2} py="py-1" size="text-[10px]" />
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}

          {/* ── Totale complessivo ── */}
          <tr className="bg-blue-50 border-t-2 border-blue-200">
            <td className="px-3 py-3 font-bold text-slate-800">Totale complessivo</td>
            <td className="px-3 py-3 tabular-nums text-right bg-sky-200 text-slate-900 font-bold">{fmtPctV(effects.marginPctP1)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(effects.effVolume)}`}>{fmtEff(effects.effVolume)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(md.brand)}`}>{fmtEff(md.brand)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(md.categoria + md.sottocategoria)}`}>{fmtEff(md.categoria + md.sottocategoria)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(md.formato)}`}>{fmtEff(md.formato)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(md.residuo)}`}>{fmtEff(md.residuo)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(effects.effPrezzo)}`}>{fmtEff(effects.effPrezzo)}</td>
            <td className={`px-3 py-3 tabular-nums text-right font-bold ${clrEff(effects.effCosto)}`}>{fmtEff(effects.effCosto)}</td>
            <td className="px-3 py-3 tabular-nums text-right bg-sky-200 text-slate-900 font-bold">{fmtPctV(effects.marginPctP2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Filter dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({
  label, values, selected, onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const label_text = selected.length > 0 ? `${label} (${selected.length})` : label;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
          selected.length > 0
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
        }`}
      >
        <span>{label_text}</span>
        <ChevronDown size={12} className={`ml-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && rect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-auto max-h-56"
        >
          {values.map(v => (
            <label key={v} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() => onToggle(v)}
                className="accent-blue-600 flex-shrink-0"
              />
              <span className="text-slate-700 whitespace-nowrap">{v}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VarianceAnalysis() {
  const { token } = useAuth();

  // ── Upload state ────────────────────────────────────────────────────────────
  const [rows, setRows]               = useState<VarRow[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const uploadRef                     = useRef<HTMLInputElement>(null);

  // ── Period / filter state ───────────────────────────────────────────────────
  const [p1Keys, setP1Keys]           = useState<string[]>([]);
  const [p2Keys, setP2Keys]           = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Partial<Record<FilterDim, string[]>>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
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

  const catDrivers = useMemo((): CatDriver[] | null => {
    if (!effects) return null;
    const map = new Map<string, { rev1: number; cost1: number; rev2: number; cost2: number }>();
    for (const l of effects.lines) {
      const cat = l.categoria.trim() || 'N/D';
      const d = map.get(cat) ?? { rev1: 0, cost1: 0, rev2: 0, cost2: 0 };
      d.rev1 += l.rev1; d.cost1 += l.cost1;
      d.rev2 += l.rev2; d.cost2 += l.cost2;
      map.set(cat, d);
    }
    const cats: CatDriver[] = [];
    for (const [categoria, d] of map.entries()) {
      const marginPct1 = d.rev1 > 0 ? (d.rev1 - d.cost1) / d.rev1 : null;
      const marginPct2 = d.rev2 > 0 ? (d.rev2 - d.cost2) / d.rev2 : null;
      const deltaMarginPct = marginPct1 !== null && marginPct2 !== null ? marginPct2 - marginPct1 : null;
      cats.push({ categoria, marginPct1, marginPct2, deltaMarginPct, rev2: d.rev2 });
    }
    return cats.filter(c => c.deltaMarginPct !== null);
  }, [effects]);

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
                  + colonne opzionali: <strong className="text-slate-700">Brand</strong>, <strong className="text-slate-700">Canale</strong>, Sottocategoria, Formato, Referenza Servizio
                </p>
                <p className="text-sm text-slate-400 mt-4">Trascina qui o clicca per selezionare (.xlsx, .xls)</p>
                <a
                  href="/template-variance-analysis.xlsx"
                  download
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Scarica Template
                </a>
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
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Analisi Varianze Margini</h1>
            <p className="text-sm text-slate-500">
              Effetti Volume, Mix, Prezzo e Costo sui margini percentuali
            </p>
          </div>
          {canShowResults && effects && (
            <button
              onClick={async () => {
                if (exportingPdf) return;
                setExportingPdf(true);
                try {
                  await downloadPDF(
                    <VariancePDF
                      effects={effects}
                      p1Label={p1Keys.join(', ')}
                      p2Label={p2Keys.join(', ')}
                      aiComment={aiComment}
                      consultantNote={consultantNote}
                    />,
                    'varianza-margini.pdf',
                  );
                } finally { setExportingPdf(false); }
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeDims.map(dim => (
                    <FilterDropdown
                      key={dim}
                      label={FILTER_DIM_LABELS[dim]}
                      values={filterOpts![dim]}
                      selected={activeFilters[dim] ?? []}
                      onToggle={(v) => toggleFilter(dim, v)}
                    />
                  ))}
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

            {/* ── Waterfall Charts ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <WaterfallChart
                data={effects.waterfallRev}
                title="Waterfall — Fatturato"
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

            {/* ── Commento AI ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <MessageSquareText className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Commento AI — Varianza Marginalità</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Generato in tempo reale dai KPI calcolati</p>
                </div>
              </div>

              <div className="flex-1 min-h-[100px]">
                {aiLoading && (
                  <div className="space-y-2.5 animate-pulse">
                    {[100, 90, 96, 80, 88].map((w, i) => (
                      <div key={i} className="h-2.5 bg-slate-200 rounded" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {aiError && !aiLoading && (
                  <div className="flex items-center gap-2 text-amber-500 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}
                {aiComment && !aiLoading && (
                  <p className="text-sm text-slate-700 leading-relaxed font-light whitespace-pre-line">
                    {aiComment}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3">
                {([
                  { label: 'Var. Totale', v: effects.marginPctP2 - effects.marginPctP1 },
                  { label: 'Eff. Volume', v: effects.effVolume },
                  { label: 'Eff. Mix',    v: effects.effMix },
                ] as { label: string; v: number }[]).map(({ label, v }) => (
                  <div key={label} className="text-center">
                    <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                    <p className={`text-sm font-bold tabular-nums ${clrPp(v)}`}>{fmtPp(v)}</p>
                  </div>
                ))}
              </div>
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

            {/* ── Top Drivers per Categoria ──────────────────────────────────── */}
            {catDrivers && catDrivers.length > 0 && (
              <div>
                <div className="mb-5">
                  <h3 className="text-base font-bold text-slate-900">Top Drivers per Categoria</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Ranking delle categorie per impatto sulla varianza margine %</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {[
                    {
                      title: 'Top 3 Variazioni',
                      items: [...catDrivers].sort((a, b) => Math.abs(b.deltaMarginPct!) - Math.abs(a.deltaMarginPct!)).slice(0, 3),
                      color: 'bg-blue-50 border-blue-200',
                    },
                    {
                      title: 'Top 3 Best Performers',
                      items: [...catDrivers].sort((a, b) => b.deltaMarginPct! - a.deltaMarginPct!).slice(0, 3),
                      color: 'bg-emerald-50 border-emerald-200',
                    },
                    {
                      title: 'Top 3 Worst Performers',
                      items: [...catDrivers].sort((a, b) => a.deltaMarginPct! - b.deltaMarginPct!).slice(0, 3),
                      color: 'bg-red-50 border-red-200',
                    },
                  ].map(({ title, items, color }) => (
                    <div key={title} className={`rounded-2xl border p-5 ${color}`}>
                      <h4 className="text-sm font-semibold text-slate-700 mb-4">{title}</h4>
                      {items.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-4">Nessun dato disponibile</p>
                        : <div className="space-y-3">
                            {items.map((c, i) => <CatDriverCard key={c.categoria} cat={c} rank={i + 1} />)}
                          </div>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Note ──────────────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col pb-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <PenLine className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Note</p>
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
          </>
        )}

      </div>

      {/* ── Pagina dedicata: Variazione Margine % per Gruppo ─────────────────── */}
      {canShowResults && effects && (
        <div className="mt-2 border-t-4 border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
          <div className="px-6 py-5 bg-slate-900 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Variazione Margine % per Gruppo</h2>
              <p className="text-xs text-slate-400 mt-1">
                Gerarchia Brand → Categoria → Sottocategoria → Formato · bridge sequenziale degli effetti
              </p>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Cos% P1</p>
                <p className="text-sm font-bold text-sky-300">{(effects.marginPctP1 * 100).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Cos% P2</p>
                <p className="text-sm font-bold text-sky-300">{(effects.marginPctP2 * 100).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Δ Totale</p>
                <p className={`text-sm font-bold ${(effects.marginPctP2 - effects.marginPctP1) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(effects.marginPctP2 - effects.marginPctP1) >= 0 ? '+' : ''}{((effects.marginPctP2 - effects.marginPctP1) * 100).toFixed(2)} pp
                </p>
              </div>
            </div>
          </div>
          <HierarchicalBridgeTable effects={effects} allLines={effects.lines} />
          </div>
          </div>
        </div>
      )}

      <div className="bg-slate-50 px-6 py-8">
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
