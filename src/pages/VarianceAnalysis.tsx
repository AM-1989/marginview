import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2,
  AlertTriangle,
  Settings2,
  MessageSquareText,
  PenLine,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { calculateVariance, type DimensionKey } from '../lib/varianceAnalysis';
import { mockRows } from '../lib/mockData';

// ── Waterfall bar shape ───────────────────────────────────────────────────────
//
// Each data point carries FOUR stacked series (all sharing stackId="wf"):
//
//   spacer  – transparent phantom from 0 to bar's start (= running total base)
//   total   – solid blue bar (P1 / P2 absolute values, start from 0)
//   green   – solid emerald bar (positive effects)
//   red     – solid red bar (negative effects, ABSOLUTE value)
//
// For positive effect  (v > 0, running = R):
//   spacer = R,   green = v,   red = 0
//   → transparent 0→R, then emerald R→(R+v) ↑
//
// For negative effect (v < 0, running = R):
//   spacer = R+v, green = 0,   red = |v|
//   → transparent 0→(R+v), then red (R+v)→R ↓  [bar "falls" from R]
//
// For P1/P2 totals:
//   spacer = 0,   total = M,   green = 0, red = 0
//   → solid blue bar 0→M
//
// Stacking order in JSX (bottom-to-top): spacer → total → green → red
// This gives the correct visual "phantom → colored segment" effect.

interface WaterfallPoint {
  name: string;
  fullName: string;
  spacer: number;
  total: number;
  green: number;
  red: number;
  rawValue: number;     // signed original value (for tooltip)
  runningAfter: number; // cumulative running total after this bar (for tooltip)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_DIMENSIONS: DimensionKey[] = ['Brand', 'Categoria', 'Sottocategoria', 'Formato'];
const AVAILABLE_YEARS = [...new Set(mockRows.map(r => r.Anno))].sort() as number[];

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtEur = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const fmtPct  = (n: number) => `${n.toFixed(1)}%`;
const fmtDiff = (n: number) => `${n >= 0 ? '+' : ''}${fmtEur.format(n)}`;
const fmtSign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

// ── Waterfall data builder ────────────────────────────────────────────────────

function buildWaterfall(
  effVol: number, effMix: number, effPr: number, effCo: number,
  M1: number, M2: number,
): WaterfallPoint[] {
  const pts: WaterfallPoint[] = [];
  let running = 0;

  const addTotal = (name: string, fullName: string, v: number) => {
    pts.push({
      name, fullName, spacer: 0, total: v, green: 0, red: 0,
      rawValue: v, runningAfter: v,
    });
    running = v;
  };

  const addEffect = (name: string, fullName: string, v: number) => {
    if (v >= 0) {
      pts.push({
        name, fullName, spacer: running, total: 0,
        green: v, red: 0, rawValue: v, runningAfter: running + v,
      });
    } else {
      pts.push({
        name, fullName, spacer: running + v, total: 0,
        green: 0, red: -v, rawValue: v, runningAfter: running + v,
      });
    }
    running += v;
  };

  addTotal( 'P1',      'Margine P1',        M1);
  addEffect('Volume',  'Effetto Volume',    effVol);
  addEffect('Mix',     'Effetto Mix',       effMix);
  addEffect('Prezzo',  'Effetto Prezzo',    effPr);
  addEffect('Costo',   'Effetto Costo',     effCo);
  addTotal( 'P2',      'Margine P2',        M2);

  return pts;
}

// ── Waterfall tooltip ─────────────────────────────────────────────────────────

interface WfEntry { payload?: WaterfallPoint }

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: WfEntry[] }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const isTotal = pt.name === 'P1' || pt.name === 'P2';
  return (
    <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3.5 text-sm min-w-52">
      <p className="font-semibold text-slate-800 mb-2.5 border-b border-slate-100 pb-2">
        {pt.fullName}
      </p>
      <div className="space-y-1.5 text-xs text-slate-600">
        <p>
          {isTotal ? 'Valore assoluto' : 'Effetto'}:{' '}
          <span className={`font-bold text-sm ${
            isTotal ? 'text-blue-600' : pt.rawValue >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {isTotal ? fmtEur.format(pt.rawValue) : fmtDiff(pt.rawValue)}
          </span>
        </p>
        {!isTotal && (
          <p>
            Margine cumulato:{' '}
            <span className="font-semibold text-slate-800">{fmtEur.format(pt.runningAfter)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── AI comment ────────────────────────────────────────────────────────────────

function buildAiComment(
  effVol: number, effMix: number, effPr: number, effCo: number,
  M1: number, M2: number, R1: number, R2: number,
  newRefs: number, dropRefs: number,
): string {
  const delta   = M2 - M1;
  const margP1  = R1 > 0 ? M1 / R1 * 100 : 0;
  const margP2  = R2 > 0 ? M2 / R2 * 100 : 0;
  const s = (v: number) => v >= 0 ? '+' : '';

  const ranked = [
    { name: 'Volume', v: effVol },
    { name: 'Mix',    v: effMix },
    { name: 'Prezzo', v: effPr  },
    { name: 'Costo',  v: effCo  },
  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));

  const top = ranked[0];

  return [
    `Il margine è variato di ${s(delta)}${fmtEur.format(delta)} (${s(margP2 - margP1)}${(margP2 - margP1).toFixed(1)} pp), passando da ${fmtEur.format(M1)} (${fmtPct(margP1)}) nel P1 a ${fmtEur.format(M2)} (${fmtPct(margP2)}) nel P2.`,
    '',
    `Il driver principale è l'Effetto ${top.name} (${s(top.v)}${fmtEur.format(top.v)}), che ${top.v >= 0 ? 'ha contribuito positivamente' : 'ha esercitato pressione negativa'} in modo preponderante rispetto agli altri effetti.`,
    '',
    effPr > 0
      ? `L'Effetto Prezzo (${s(effPr)}${fmtEur.format(effPr)}) riflette incrementi di listino sulle referenze chiave — segnale di pricing power nel portafoglio.`
      : `L'Effetto Prezzo (${s(effPr)}${fmtEur.format(effPr)}) evidenzia pressione competitiva sui prezzi di vendita rispetto al periodo precedente.`,
    '',
    effCo > 0
      ? `L'Effetto Costo (${s(effCo)}${fmtEur.format(effCo)}) indica una riduzione dei costi di input — miglioramento dell'efficienza o rinegoziazione contrattuale.`
      : `L'Effetto Costo (${s(effCo)}${fmtEur.format(effCo)}) riflette un incremento dei costi di acquisto. Si consiglia analisi di sourcing o rinegoziazione con fornitori strategici.`,
    '',
    (newRefs > 0 || dropRefs > 0)
      ? `Full Outer Join: ${newRefs} nuov${newRefs !== 1 ? 'e' : 'a'} referenz${newRefs !== 1 ? 'e' : 'a'} compaiono in P2; ${dropRefs} referenz${dropRefs !== 1 ? 'e' : 'a'} presenti in P1 non risultano nel P2 (discontinuat${dropRefs !== 1 ? 'e' : 'a'}).`
      : 'Il portafoglio è stabile: le stesse referenze sono attive in entrambi i periodi.',
  ].join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VarianceAnalysis() {
  const [p1Year, setP1Year] = useState<number>(AVAILABLE_YEARS[0] ?? 2025);
  const [p2Year, setP2Year] = useState<number>(
    AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1] ?? 2026,
  );
  const [activeDimensions, setActiveDimensions] = useState<DimensionKey[]>([...ALL_DIMENSIONS]);
  const [userNote, setUserNote] = useState('');

  // ── Core calculation ──────────────────────────────────────────────────────
  const result = useMemo(
    () => calculateVariance(mockRows, p1Year, p2Year, activeDimensions),
    [p1Year, p2Year, activeDimensions],
  );

  // ── Derived aggregates ────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const M1 = result.dettaglio.reduce((s, d) => s + d.Margine1,   0);
    const M2 = result.dettaglio.reduce((s, d) => s + d.Margine2,   0);
    const R1 = result.dettaglio.reduce((s, d) => s + d.Fatturato1, 0);
    const R2 = result.dettaglio.reduce((s, d) => s + d.Fatturato2, 0);

    const margPerc1 = R1 > 0 ? M1 / R1 * 100 : 0;
    const margPerc2 = R2 > 0 ? M2 / R2 * 100 : 0;

    // Total mix derived: what's left after the three explicit effects
    const effMix = result.deltaMargineTotale
                 - result.effettoVolume
                 - result.effettoPrezzo
                 - result.effettoCosto;

    // Quadrature: sum of all four effects must equal ΔM (true by construction)
    const checkSum   = result.effettoVolume + effMix + result.effettoPrezzo + result.effettoCosto;
    const isBalanced = Math.abs(checkSum - result.deltaMargineTotale) < 0.01;

    // Per-dimension mix totals (each independently equals effMix)
    const dimTotals = activeDimensions.map(dim => ({
      dim,
      total: result.effettiMix
        .filter(e => e.dimension === dim)
        .reduce((s, e) => s + e.effect, 0),
    }));

    const waterfallData = buildWaterfall(
      result.effettoVolume, effMix, result.effettoPrezzo, result.effettoCosto, M1, M2,
    );

    const newRefs  = result.dettaglio.filter(d => d.Q1 === 0 && d.Q2 > 0).length;
    const dropRefs = result.dettaglio.filter(d => d.Q1 > 0 && d.Q2 === 0).length;

    return {
      M1, M2, R1, R2, margPerc1, margPerc2,
      effMix, isBalanced, waterfallData, dimTotals, newRefs, dropRefs,
    };
  }, [result, activeDimensions]);

  const {
    M1, M2, R1, R2, margPerc1, margPerc2,
    effMix, isBalanced, waterfallData, dimTotals, newRefs, dropRefs,
  } = derived;

  // ── Effects table rows ────────────────────────────────────────────────────
  const effectRows = useMemo(() => {
    type RowType = 'total' | 'effect' | 'mixSub';
    const make = (label: string, value: number, type: RowType) => ({
      label, value, type,
      pctOfM1: M1 !== 0 ? value / M1 * 100 : 0,
    });
    return [
      make(`Margine ${p1Year}`,   M1,                    'total'),
      make('Effetto Volume',      result.effettoVolume,  'effect'),
      make('Effetto Mix Totale',  effMix,                'effect'),
      ...dimTotals.map(({ dim, total }) => make(`  ↳ Mix ${dim}`, total, 'mixSub')),
      make('Effetto Prezzo',      result.effettoPrezzo,  'effect'),
      make('Effetto Costo',       result.effettoCosto,   'effect'),
      make(`Margine ${p2Year}`,   M2,                    'total'),
    ];
  }, [M1, M2, p1Year, p2Year, result, effMix, dimTotals]);

  // ── Sorted product detail ─────────────────────────────────────────────────
  const sortedDetail = useMemo(
    () => [...result.dettaglio].sort((a, b) => Math.abs(b.DeltaMargine) - Math.abs(a.DeltaMargine)),
    [result],
  );

  // ── AI comment ────────────────────────────────────────────────────────────
  const aiComment = useMemo(
    () => buildAiComment(
      result.effettoVolume, effMix, result.effettoPrezzo, result.effettoCosto,
      M1, M2, R1, R2, newRefs, dropRefs,
    ),
    [result, effMix, M1, M2, R1, R2, newRefs, dropRefs],
  );

  function toggleDimension(dim: DimensionKey) {
    setActiveDimensions(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8 max-w-7xl">

      {/* ── Header + Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Title */}
        <div className="flex-1 min-w-48">
          <h2 className="text-xl font-bold text-slate-900">Varianza Marginalità</h2>
          <p className="text-sm text-slate-500 mt-1">
            Waterfall analysis · {result.dettaglio.length} referenze nel Full Outer Join
          </p>
        </div>

        {/* Year selectors */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">P1</label>
            <select
              value={p1Year}
              onChange={e => setP1Year(Number(e.target.value))}
              className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 cursor-pointer"
            >
              {AVAILABLE_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <span className="text-slate-300 font-light text-lg">→</span>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">P2</label>
            <select
              value={p2Year}
              onChange={e => setP2Year(Number(e.target.value))}
              className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 cursor-pointer"
            >
              {AVAILABLE_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dimension checkboxes */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <Settings2 className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Dimensioni Mix
            </p>
          </div>
          <div className="flex items-center gap-4">
            {ALL_DIMENSIONS.map(dim => (
              <label key={dim} className="flex items-center gap-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={activeDimensions.includes(dim)}
                  onChange={() => toggleDimension(dim)}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                  {dim}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Fatturato */}
        {[
          {
            label: 'Fatturato',
            v1: R1, v2: R2,
            delta: R2 - R1,
            fmt: fmtEur,
          },
          {
            label: 'Margine €',
            v1: M1, v2: M2,
            delta: M2 - M1,
            fmt: fmtEur,
          },
        ].map(({ label, v1, v2, delta, fmt }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">
                {fmt.format(v2)}
              </span>
              {delta >= 0
                ? <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                : <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
              }
            </div>
            <p className="text-[11px] text-slate-400 tabular-nums">
              P1: {fmt.format(v1)}
            </p>
            <p className={`text-xs font-semibold mt-1.5 tabular-nums ${
              delta >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {fmtDiff(delta)}{' '}
              <span className="font-normal text-slate-400">
                ({fmtSign(v1 !== 0 ? delta / v1 * 100 : 0)})
              </span>
            </p>
          </div>
        ))}

        {/* Margine % */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Margine %</p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`text-xl font-bold leading-none tabular-nums ${
              margPerc2 >= margPerc1 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {fmtPct(margPerc2)}
            </span>
            {margPerc2 >= margPerc1
              ? <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              : <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
            }
          </div>
          <p className="text-[11px] text-slate-400 tabular-nums">P1: {fmtPct(margPerc1)}</p>
          <p className={`text-xs font-semibold mt-1.5 tabular-nums ${
            margPerc2 >= margPerc1 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {fmtSign(margPerc2 - margPerc1)} pp
          </p>
        </div>

        {/* Quadrature check */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          isBalanced
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Check Quadratura
          </p>
          <div className="flex items-center gap-2">
            {isBalanced
              ? <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              : <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            }
            <span className={`text-sm font-semibold ${
              isBalanced ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {isBalanced ? 'Verificata' : 'Attenzione'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            {isBalanced
              ? `ΔM = ${fmtEur.format(result.deltaMargineTotale)} ≡ Σ Effetti`
              : 'Sbilancio nella scomposizione'
            }
          </p>
        </div>
      </div>

      {/* ── Waterfall Chart ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700">
            Bridge Chart — Scomposizione ΔMargine {p1Year} → {p2Year}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Valori in € assoluti · Barra fantoccio trasparente + segmento colorato per effetto floating
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-5">
          {[
            { color: 'bg-blue-500',    label: 'Margine assoluto (P1/P2)' },
            { color: 'bg-emerald-500', label: 'Effetto positivo'         },
            { color: 'bg-red-400',     label: 'Effetto negativo'         },
          ].map(({ color, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-3 h-3 rounded-sm ${color}`} />
              {label}
            </span>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={waterfallData}
            margin={{ top: 5, right: 20, bottom: 5, left: 15 }}
            barCategoryGap="25%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => `€${((v as number) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false} width={48}
            />
            <Tooltip
              content={(props) => WaterfallTooltip(props as unknown as { active?: boolean; payload?: WfEntry[] })}
              cursor={{ fill: '#f8fafc' }}
            />

            {/*
             * Stacking order (bottom→top):
             *   1. spacer  – phantom, fill="transparent"
             *   2. total   – P1/P2 absolute bars, fill=blue
             *   3. green   – positive effects, fill=emerald
             *   4. red     – negative effects (abs val), fill=red
             */}
            <Bar dataKey="spacer" stackId="wf" fill="transparent"  isAnimationActive={false} />
            <Bar dataKey="total"  stackId="wf" fill="#3b82f6"       radius={[4, 4, 0, 0]} />
            <Bar dataKey="green"  stackId="wf" fill="#10b981"       radius={[4, 4, 0, 0]} />
            <Bar dataKey="red"    stackId="wf" fill="#f87171"       radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Effects table + Mix breakdown ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Synthetic effects table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Tabella Effetti</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mix Totale ripartito per dimensione — valori equivalenti (decomposizioni parallele)
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Effetto</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">€</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">% su P1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {effectRows.map((row, i) => {
                const isTotal   = row.type === 'total';
                const isMixSub  = row.type === 'mixSub';
                const isPos     = row.value >= 0;
                return (
                  <tr key={i} className={`
                    ${isTotal  ? 'bg-slate-900 text-white' : 'hover:bg-slate-50/70'}
                    ${isMixSub ? 'bg-slate-50/50' : ''}
                    transition-colors
                  `}>
                    <td className={`px-5 py-3 text-xs font-medium ${
                      isTotal ? 'text-white' : isMixSub ? 'text-slate-400' : 'text-slate-700'
                    }`}>
                      {row.label}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold text-xs ${
                      isTotal ? 'text-white'
                        : isPos ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {isTotal ? fmtEur.format(row.value) : fmtDiff(row.value)}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums text-xs ${
                      isTotal ? 'text-slate-300'
                        : isPos ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {isTotal
                        ? (i === 0 ? '100.0%' : fmtSign(row.pctOfM1))
                        : fmtSign(row.pctOfM1)
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {activeDimensions.length > 1 && (
            <p className="px-5 py-3 text-[10px] text-slate-400 border-t border-slate-100 leading-relaxed">
              * Le righe ↳ Mix sono decomposizioni alternative dello stesso effetto totale. Non sommarle.
            </p>
          )}
        </div>

        {/* Mix breakdown per dimension */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Dettaglio Mix per Dimensione</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Contributo di ogni gruppo alla variazione di mix (Σ gruppo = Mix Totale per dimensione)
            </p>
          </div>
          <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto scrollbar-thin">
            {activeDimensions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">
                Nessuna dimensione attiva selezionata
              </p>
            ) : (
              activeDimensions.map(dim => {
                const entries = result.effettiMix
                  .filter(e => e.dimension === dim)
                  .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
                const dimSum = entries.reduce((s, e) => s + e.effect, 0);
                return (
                  <div key={dim}>
                    <div className="px-5 py-2 bg-slate-50 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Mix {dim}
                      </p>
                      <p className={`text-[10px] font-bold tabular-nums ${
                        dimSum >= 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {fmtDiff(dimSum)}
                      </p>
                    </div>
                    {entries.map(e => {
                      const pct = dimSum !== 0 ? e.effect / Math.abs(dimSum) * 100 : 0;
                      return (
                        <div key={e.label} className="px-5 py-2.5 flex items-center gap-3">
                          <span className="text-xs text-slate-600 w-28 truncate flex-shrink-0">{e.label}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${e.effect >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(Math.abs(pct), 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums w-20 text-right ${
                            e.effect >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {fmtDiff(e.effect)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Product detail table ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Dettaglio Referenze — Full Outer Join</h3>
          <span className="text-xs text-slate-400">Ordinato per impatto assoluto sul ΔMargine</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left">
                {[
                  'Referenza', 'Descrizione',
                  'Q1', 'Q2', 'ΔQ',
                  'P1 medio', 'P2 medio', 'ΔP',
                  'Margine P1', 'Margine P2', 'Δ Margine',
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedDetail.map(d => {
                const dq = d.Q2 - d.Q1;
                const dp = d.P2 - d.P1;
                const isNew  = d.Q1 === 0 && d.Q2 > 0;
                const isDrop = d.Q1 > 0  && d.Q2 === 0;
                return (
                  <tr key={d.Referenza} className="hover:bg-slate-50/60 transition-colors group">
                    <td className="px-4 py-3 font-mono text-slate-400 group-hover:text-slate-600">
                      {d.Referenza}
                      {isNew  && <span className="ml-1 text-[9px] font-bold text-emerald-600 border border-emerald-200 px-1 rounded">NEW</span>}
                      {isDrop && <span className="ml-1 text-[9px] font-bold text-red-500 border border-red-200 px-1 rounded">OUT</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium max-w-40 truncate">{d.Descrizione}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{d.Q1.toLocaleString('it-IT')}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{d.Q2.toLocaleString('it-IT')}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${dq >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {dq >= 0 ? '+' : ''}{dq.toLocaleString('it-IT')}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{fmtEur.format(d.P1)}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{fmtEur.format(d.P2)}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${dp >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {dp >= 0 ? '+' : ''}{fmtEur.format(dp)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{fmtEur.format(d.Margine1)}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{fmtEur.format(d.Margine2)}</td>
                    <td className={`px-4 py-3 font-bold tabular-nums ${d.DeltaMargine >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtDiff(d.DeltaMargine)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Comments ──────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        {/* AI */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <MessageSquareText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Analisi AI — Waterfall Drivers</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {p1Year} → {p2Year} · {activeDimensions.length} dimensioni attive
              </p>
            </div>
          </div>
          <div className="flex-1 text-sm text-slate-300 leading-relaxed whitespace-pre-line font-light">
            {aiComment}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Volume',  value: result.effettoVolume  },
                { label: 'Mix',     value: effMix                },
                { label: 'Prezzo',  value: result.effettoPrezzo  },
                { label: 'Costo',   value: result.effettoCosto   },
              ].map(({ label, value }) => (
                <span key={label} className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold ${
                  value >= 0
                    ? 'border-emerald-800 text-emerald-400 bg-emerald-900/30'
                    : 'border-red-900 text-red-400 bg-red-900/20'
                }`}>
                  {label}: {fmtDiff(value)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* User note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Note del Controller</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Analisi e azioni correttive</p>
            </div>
          </div>
          <textarea
            value={userNote}
            onChange={e => setUserNote(e.target.value)}
            placeholder="Inserisci commenti strategici, cause root identificate, o azioni correttive pianificate..."
            className="
              flex-1 resize-none rounded-xl bg-slate-50 border border-slate-200
              p-4 text-sm text-slate-700 leading-relaxed
              placeholder:text-slate-300
              focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
              transition-all min-h-52
            "
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-400">Le note non vengono salvate in questa demo</p>
            {userNote && (
              <p className="text-[11px] text-slate-400 tabular-nums">{userNote.length} car.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
