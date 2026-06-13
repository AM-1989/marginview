import { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Upload, Loader2, FileSpreadsheet, Filter, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  RotateCcw, X, Info,
} from 'lucide-react';
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
const fmtPct = (v: number, dec = 2) => `${v.toFixed(dec)}%`;
const fmtPp  = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp`;
const fmtDiff = (v: number) => `${v >= 0 ? '+' : ''}${fmtEur.format(v)}`;
const clrPp  = (v: number) => v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-slate-500';
const nd     = (v: number | null, fmt: (n: number) => string) => v !== null ? fmt(v) : 'N/D';

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

function WaterfallChart({
  data, title, subtitle, yFmt, tooltip,
}: {
  data: WaterfallPoint[];
  title: string;
  subtitle: string;
  yFmt: (v: number) => string;
  tooltip: React.ComponentType<{ active?: boolean; payload?: { payload?: WaterfallPoint }[] }>;
}) {
  const TooltipComp = tooltip;
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
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={(props) => <TooltipComp active={props.active} payload={props.payload as unknown as { payload?: WaterfallPoint }[]} />} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey="spacer" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="total"  stackId="wf" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="green"  stackId="wf" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="red"    stackId="wf" fill="#f87171" radius={[4, 4, 0, 0]} isAnimationActive={false} />
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
//          | Eff. Prezzo | Eff. Costo | Eff. P+C | M% P2 | Stato
//
// "Delta M% Gruppo" = M% P2 − M% P1 (osservato, non un effetto).
// "Eff. P+C"        = effPrezzo + effCosto (componente spiegata dal modello).
// La differenza tra i due è la componente mix/volume interna al gruppo.

function EffectsTableRow({
  group, expanded, onToggle,
}: {
  group: TableGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = group.lines.length > 1;

  // Effetto Totale (P+C): somma degli effetti spiegati dal modello a livello gruppo
  const effPC = group.effPrezzo !== null && group.effCosto !== null
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
        {/* Eff. Prezzo */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-medium ${group.effPrezzo !== null ? clrPp(group.effPrezzo) : 'text-slate-400'}`}>
          {group.effPrezzo !== null ? fmtPp(group.effPrezzo) : 'N/D'}
        </td>
        {/* Eff. Costo */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-medium ${group.effCosto !== null ? clrPp(group.effCosto) : 'text-slate-400'}`}>
          {group.effCosto !== null ? fmtPp(group.effCosto) : 'N/D'}
        </td>
        {/* Eff. P+C (componente spiegata) */}
        <td className={`px-4 py-3 text-xs tabular-nums text-right font-bold ${effPC !== null ? clrPp(effPC) : 'text-slate-400'}`}>
          {effPC !== null ? fmtPp(effPC) : 'N/D'}
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
          {/* Eff. Prezzo / Costo / P+C — non significativi a livello singola referenza */}
          <td className="px-4 py-2 tabular-nums text-right text-slate-300" colSpan={3}>—</td>
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

function DetailTableRow({ group, expanded, onToggle, isGrouped }: {
  group: TableGroup; expanded: boolean; onToggle: () => void; isGrouped: boolean;
}) {
  const hasChildren = isGrouped && group.lines.length > 1;
  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors text-xs ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        <td className="px-4 py-3 text-slate-700 font-medium flex items-center gap-1.5">
          {hasChildren && (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}
          {isGrouped
            ? `${group.categoria || group.brand || group.key}${group.lines.length > 1 ? ` — ${group.lines.length} prodotti` : ''}`
            : (group.lines[0]?.descrizione || group.key)
          }
        </td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1  > 0 ? fmtEur.format(group.rev1) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev1  > 0 ? fmtEur.format(group.cost1) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct1, v => fmtPct(v * 100))}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2  > 0 ? fmtEur.format(group.rev2) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{group.rev2  > 0 ? fmtEur.format(group.cost2) : 'N/D'}</td>
        <td className="px-4 py-3 tabular-nums text-right text-slate-600">{nd(group.marginPct2, v => fmtPct(v * 100))}</td>
        <td className={`px-4 py-3 tabular-nums text-right font-semibold ${group.effTotale !== null ? clrPp(group.effTotale) : 'text-slate-400'}`}>
          {group.effTotale !== null ? fmtPp(group.effTotale) : 'N/D'}
        </td>
        <td className="px-4 py-3 text-center">
          {group.effTotale !== null && (
            group.effTotale > 0
              ? <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto" />
              : group.effTotale < 0
                ? <TrendingDown className="w-4 h-4 text-red-400 mx-auto" />
                : <span className="text-slate-400 text-xs">—</span>
          )}
        </td>
      </tr>
      {expanded && group.lines.map(l => (
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
          <td className={`px-4 py-2 tabular-nums text-right font-semibold ${l.deltaMarginPct !== null ? clrPp(l.deltaMarginPct) : 'text-slate-400'}`}>
            {l.deltaMarginPct !== null ? fmtPp(l.deltaMarginPct) : 'N/D'}
          </td>
          <td className="px-4 py-2 text-center text-slate-300">—</td>
        </tr>
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VarianceAnalysis() {
  // ── Upload state ────────────────────────────────────────────────────────────
  const [rows, setRows]               = useState<VarRow[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [dragging, setDragging]       = useState(false);
  const uploadRef                     = useRef<HTMLInputElement>(null);

  // ── Period / filter state ───────────────────────────────────────────────────
  const [p1Keys, setP1Keys]           = useState<string[]>([]);
  const [p2Keys, setP2Keys]           = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Partial<Record<FilterDim, string[]>>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDetail, setExpandedDetail] = useState<Set<string>>(new Set());
  const [detailView, setDetailView]   = useState<'grouped' | 'lista'>('grouped');
  const [verifyView, setVerifyView]   = useState<'grouped' | 'lista'>('grouped');

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
      <div className="min-h-full bg-slate-50 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">🧮 Analisi Varianze Margini</h1>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              Carica il tuo file Excel per analizzare gli effetti Volume, Mix, Prezzo e Costo sui margini percentuali
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 pt-7 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Carica Dati Finanziari</h2>
                  <p className="text-xs text-slate-400">Carica un file Excel con i dati granulari per l'analisi degli effetti</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div
                className={`border-2 border-dashed rounded-xl py-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => uploadRef.current?.click()}
              >
                {loading
                  ? <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  : <Upload className="w-10 h-10 text-slate-300" />
                }
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600">Trascina qui il tuo file Excel</p>
                  <p className="text-xs text-slate-400 mt-1">oppure</p>
                </div>
                <button
                  type="button"
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={e => { e.stopPropagation(); uploadRef.current?.click(); }}
                >
                  Sfoglia File
                </button>
                <p className="text-xs text-slate-400">.xlsx e .xls</p>
                <input
                  ref={uploadRef} type="file" accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                />
              </div>
            </div>

            <div className="px-8 pb-8">
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Formato Excel Richiesto:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    ['Codice Materiale', 'Codice univoco del prodotto/servizio'],
                    ['Descrizione Materiale', 'Nome del prodotto/servizio'],
                    ['Anno', 'Anno di competenza'],
                    ['Mese', 'Mese di competenza (numero o nome italiano)'],
                    ['Quantità', 'Quantità venduta'],
                    ['Fatturato', 'Ricavi netti'],
                    ['Costo Unitario / Tariffa', 'Costo per unità'],
                    ['Brand', 'Brand del prodotto (opzionale)'],
                    ['Categoria', 'Categoria del prodotto (opzionale)'],
                    ['Sottocategoria', 'Sottocategoria (opzionale)'],
                    ['Formato', 'Formato del prodotto (opzionale)'],
                    ['Paese / Canale', 'Dimensioni aggiuntive (opzionali)'],
                  ].map(([col, desc]) => (
                    <div key={col} className="flex gap-2 text-xs">
                      <span className="font-semibold text-slate-700 flex-shrink-0">{col}:</span>
                      <span className="text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">🧮 Analisi Varianze Margini</h1>
          <p className="text-sm text-slate-500">
            Carica il tuo file Excel per analizzare gli effetti Volume, Mix, Prezzo e Costo sui margini percentuali
          </p>
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

            {/* ── Waterfall Charts ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <WaterfallChart
                data={effects.waterfallRev}
                title="Waterfall — Fatturato"
                subtitle="Contributo per categoria"
                yFmt={v => `€${((v as number) / 1000).toFixed(0)}k`}
                tooltip={WfTooltipEur}
              />
              <WaterfallChart
                data={effects.waterfallMargin}
                title="Waterfall — Margine €"
                subtitle="Contributo per categoria"
                yFmt={v => `€${((v as number) / 1000).toFixed(0)}k`}
                tooltip={WfTooltipEur}
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

                {/* Effects summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Effetto Volume', v: effects.effVolume },
                    { label: 'Eff. Mix',       v: effects.effMix },
                    { label: 'Effetto Prezzo', v: effects.effPrezzo },
                    { label: 'Effetto Costo',  v: effects.effCosto },
                  ].map(({ label, v }) => (
                    <div key={label} className={`rounded-xl p-4 border ${v > 0 ? 'bg-emerald-50 border-emerald-200' : v < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                      <p className={`text-xl font-bold tabular-nums ${clrPp(v)}`}>{fmtPp(v)}</p>
                    </div>
                  ))}
                </div>

                {/* Mix section — solo Effetto Mix Totale globale (calcolato su technicalRows) */}
                <div className={`rounded-xl p-5 border ${effects.effMix > 0 ? 'bg-emerald-50 border-emerald-200' : effects.effMix < 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Effetto Mix Totale</p>
                  <p className={`text-3xl font-bold tabular-nums mb-2 ${clrPp(effects.effMix)}`}>{fmtPp(effects.effMix)}</p>
                  <p className="text-xs text-slate-600">
                    {effects.effMix > 0.001
                      ? 'Il mix prodotti migliora la redditività — prodotti ad alto margine pesano di più in P2.'
                      : effects.effMix < -0.001
                        ? 'Il mix prodotti peggiora la redditività — prodotti a basso margine pesano di più in P2.'
                        : 'Il mix prodotti ha impatto marginale sulla redditività.'
                    }
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Effetto calcolato a prezzi e costi P1 su volumi P2. Include prodotti nuovi (onlyP2) e usciti (onlyP1).
                    Le variazioni per singolo gruppo sono nella sezione "Variazione Margine % per Gruppo" in basso.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Variazione Margine % per Gruppo ───────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Variazione Margine % per Gruppo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Delta M% Gruppo = M% P2 − M% P1 (osservato). Eff. Prezzo e Costo = componenti spiegate dal modello a livello gruppo. Clicca ▶ per il dettaglio referenze.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Brand', 'Categoria', 'Sottocategoria', 'M% P1', 'Delta M% Gruppo', 'Eff. Prezzo', 'Eff. Costo', 'Eff. P+C', 'M% P2', 'Stato'].map(h => (
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
                      {['Fatt. P1','Costi P1','M% P1','Fatt. P2','Costi P2','M% P2','Varianza','Trend'].map(h => (
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
                          return <DetailTableRow key={l.key} group={mg} expanded={false} onToggle={() => {}} isGrouped={false} />;
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
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
