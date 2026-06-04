import { useMemo, useState, useRef } from 'react';
import { SlidersHorizontal, MessageSquareText, PenLine, ChevronsUpDown } from 'lucide-react';
import { calculateAbcAnalysis } from '../lib/abcAnalysis';
import { mockRows } from '../lib/mockData';
import type { AbcRating, AbcResult, AbcSummary } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const RATINGS: AbcRating[] = ['A', 'B', 'C'];

const RATING_BADGE: Record<AbcRating, string> = {
  A: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  B: 'bg-amber-100 text-amber-700 border border-amber-200',
  C: 'bg-red-100 text-red-700 border border-red-200',
};

const RATING_DOT: Record<AbcRating, string> = {
  A: '#10b981',
  B: '#f59e0b',
  C: '#ef4444',
};

// Mirrors FINAL_RATING in abcAnalysis.ts (used for matrix cell color only)
const FINAL_RATING: Record<AbcRating, Record<AbcRating, AbcRating>> = {
  A: { A: 'A', B: 'A', C: 'B' },
  B: { A: 'A', B: 'B', C: 'C' },
  C: { A: 'B', B: 'C', C: 'C' },
};

const CELL_BG: Record<AbcRating, string> = {
  A: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  B: 'bg-amber-50 border-amber-200 text-amber-800',
  C: 'bg-red-50 border-red-200 text-red-800',
};

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtEur = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtInt = new Intl.NumberFormat('it-IT');
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ── AI comment — dynamically built from live data ─────────────────────────────

function buildAiComment(summary: AbcSummary, details: AbcResult[]): string {
  const classA     = details.filter(d => d.RatingFinale === 'A');
  const classC     = details.filter(d => d.RatingFinale === 'C');
  const criticalAC = details.filter(d => d.RatingFatturato === 'A' && d.RatingProfitto === 'C');
  const starBA     = details.filter(d => d.RatingFatturato === 'B' && d.RatingProfitto === 'A');
  const classAShare = classA.reduce((s, d) => s + d.Fatturato, 0) / summary.TotaleFatturato;
  const top3Share   = details.slice(0, 3).reduce((s, d) => s + d.Fatturato, 0) / summary.TotaleFatturato;
  const conc        = classAShare > 0.75 ? 'fortemente' : 'moderatamente';

  const lines = [
    `L'analisi ABC identifica ${classA.length} referenze di Classe A che concentrano il ${fmtPct(classAShare * 100)} del fatturato complessivo — distribuzione ${conc} concentrata, coerente con la Legge di Pareto applicata ai portafogli consumer.`,
    '',
    criticalAC.length > 0
      ? `⚠ Criticità AC: ${criticalAC.length} referenz${criticalAC.length > 1 ? 'e generano' : 'a genera'} volumi rilevanti ma marginalità inferiore alla media aziendale (${fmtPct(summary.MarginePercGlobale)}). Prodotti coinvolti: ${criticalAC.map(d => d.Descrizione).join(', ')}. Si raccomanda revisione del pricing o analisi dei driver di costo specifici.`
      : `✓ Nessuna referenza critica in classe AC: buona correlazione tra contributo al fatturato e marginalità unitaria.`,
    '',
    starBA.length > 0
      ? `★ Opportunità BA: ${starBA.length} referenz${starBA.length > 1 ? 'e' : 'a'} (${starBA.map(d => d.Descrizione).join(', ')}) mostrano marginalità superiore alla media con volumi nella fascia B — candidati ideali per azioni di sviluppo commerciale o ampliamento distribuzione.`
      : null,
    starBA.length > 0 ? '' : null,
    classC.length > 0
      ? `Le ${classC.length} referenze di Classe C contribuiscono marginalmente sia al fatturato che alla marginalità totale. Una razionalizzazione del portafoglio potrebbe liberare risorse allocative da ridirigere su classi A e BA.`
      : null,
    '',
    `Indicatori sintetici: concentrazione top-3 ${fmtPct(top3Share * 100)} · margine medio ${fmtPct(summary.MarginePercGlobale)} · ${summary.NumReferenze} referenze analizzate.`,
  ];

  return lines.filter(l => l !== null).join('\n');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: AbcRating }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${RATING_BADGE[rating]}`}>
      {rating}
    </span>
  );
}

interface ScatterPoint {
  x: number;
  y: number;
  name: string;
  ref: string;
  rating: AbcRating;
}

// ── Custom SVG scatter plot — avoids Recharts ScatterChart which has ref
// incompatibilities with React 19 (React 19 changed the ref contract and
// Recharts internally uses legacy class-component ref patterns).
// ──────────────────────────────────────────────────────────────────────────────

const SVG_W = 420;
const SVG_H = 250;
const PAD   = { top: 12, right: 16, bottom: 38, left: 60 };
const PLOT_W = SVG_W - PAD.left - PAD.right;
const PLOT_H = SVG_H - PAD.top  - PAD.bottom;

function CustomScatterPlot({ groups }: { groups: Record<AbcRating, ScatterPoint[]> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<ScatterPoint | null>(null);
  const [tip, setTip]         = useState({ x: 0, y: 0 });

  const allPts = RATINGS.flatMap(r => groups[r]);

  if (allPts.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center text-sm text-slate-400">
        Nessun dato
      </div>
    );
  }

  const xs = allPts.map(p => p.x);
  const ys = allPts.map(p => p.y);
  const dX = Math.max(...xs) - Math.min(...xs) || Math.max(...xs) * 0.2;
  const dY = Math.max(...ys) - Math.min(...ys) || Math.max(...ys) * 0.2;
  const x0 = Math.min(...xs) - dX * 0.08, x1 = Math.max(...xs) + dX * 0.08;
  const y0 = Math.min(...ys) - dY * 0.14, y1 = Math.max(...ys) + dY * 0.14;

  const sx = (v: number) => PAD.left  + ((v - x0) / (x1 - x0)) * PLOT_W;
  const sy = (v: number) => PAD.top   + (1 - (v - y0) / (y1 - y0)) * PLOT_H;

  const N = 4;
  const xTicks = Array.from({ length: N }, (_, i) => x0 + (x1 - x0) * (i + 1) / N);
  const yTicks = Array.from({ length: N }, (_, i) => y0 + (y1 - y0) * (i + 1) / N);

  function onEnter(e: React.MouseEvent, pt: ScatterPoint) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 20 });
    setHovered(pt);
  }

  return (
    <div ref={containerRef} className="relative select-none" onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ height: SVG_H }}>
        {/* Horizontal grid */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.left} y1={sy(t)} x2={SVG_W - PAD.right} y2={sy(t)}
            stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {/* Vertical grid */}
        {xTicks.map((t, i) => (
          <line key={i} x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={SVG_H - PAD.bottom}
            stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {/* X axis labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={sx(t)} y={SVG_H - PAD.bottom + 14}
            textAnchor="middle" fontSize={10} fill="#94a3b8">
            €{(t / 1000).toFixed(0)}k
          </text>
        ))}
        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left - 6} y={sy(t) + 4}
            textAnchor="end" fontSize={10} fill="#94a3b8">
            {t.toFixed(0)}%
          </text>
        ))}
        {/* Axis border */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={SVG_H - PAD.bottom}
          stroke="#e2e8f0" strokeWidth={1} />
        <line x1={PAD.left} y1={SVG_H - PAD.bottom} x2={SVG_W - PAD.right} y2={SVG_H - PAD.bottom}
          stroke="#e2e8f0" strokeWidth={1} />
        {/* Data points — rendered per rating so higher ratings draw on top */}
        {RATINGS.slice().reverse().map(r =>
          groups[r].map((pt, i) => (
            <circle
              key={`${r}-${i}`}
              cx={sx(pt.x)} cy={sy(pt.y)} r={6}
              fill={RATING_DOT[r]} fillOpacity={0.82}
              stroke="white" strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => onEnter(e, pt)}
            />
          ))
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute z-10 pointer-events-none bg-white border border-slate-200 shadow-xl rounded-xl p-3.5 text-sm min-w-44"
          style={{ left: tip.x, top: tip.y }}
        >
          <p className="font-semibold text-slate-900 truncate">{hovered.name}</p>
          <p className="text-slate-400 text-[11px] mb-2">{hovered.ref}</p>
          <div className="space-y-1 text-xs text-slate-600">
            <p>Fatturato: <span className="font-semibold text-slate-800">{fmtEur.format(hovered.x)}</span></p>
            <p>Margine %: <span className="font-semibold text-slate-800">{fmtPct(hovered.y)}</span></p>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-2">
            <RatingBadge rating={hovered.rating} />
            <span className="text-[11px] text-slate-500">Rating Finale</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 justify-center mt-1">
        {RATINGS.map(r => (
          <span key={r} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: RATING_DOT[r] }} />
            Classe {r}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'Referenza' | 'Fatturato' | 'Margine' | 'MarginePerc'
             | 'RatingFatturato' | 'RatingProfitto' | 'RatingFinale';

interface ColDef { key: SortKey | null; label: string; }

const COLUMNS: ColDef[] = [
  { key: 'Referenza',       label: 'Codice'    },
  { key: null,              label: 'Descrizione' },
  { key: 'Fatturato',       label: 'Fatturato'  },
  { key: 'Margine',         label: 'Margine'    },
  { key: 'MarginePerc',     label: 'Marg %'     },
  { key: 'RatingFatturato', label: 'R. Fatt.'   },
  { key: 'RatingProfitto',  label: 'R. Prof.'   },
  { key: 'RatingFinale',    label: 'Rating'     },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ABCAnalysis() {
  const [profitTolerance, setProfitTolerance] = useState(5);
  const [sortKey,  setSortKey]  = useState<SortKey>('Fatturato');
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc');
  const [userNote, setUserNote] = useState('');

  // ── Core calc — re-runs only when tolerance changes ─────────────────────────
  const { summary, details } = useMemo(
    () => calculateAbcAnalysis(mockRows, profitTolerance),
    [profitTolerance],
  );

  // ── Scatter data grouped by RatingFinale ─────────────────────────────────
  const scatterGroups = useMemo(() => {
    const groups: Record<AbcRating, ScatterPoint[]> = { A: [], B: [], C: [] };
    for (const d of details) {
      groups[d.RatingFinale].push({
        x: d.Fatturato, y: d.MarginePerc,
        name: d.Descrizione, ref: d.Referenza,
        rating: d.RatingFinale,
      });
    }
    return groups;
  }, [details]);

  // ── 3×3 matrix counts ─────────────────────────────────────────────────────
  //
  // matrixCounts[revRating][profRating] = number of products where
  //   RatingFatturato === revRating AND RatingProfitto === profRating
  //
  // The matrix display maps columns → RatingFatturato, rows → RatingProfitto.
  // The background color of each cell comes from FINAL_RATING[rev][prof].
  //
  const matrixCounts = useMemo(() => {
    const m: Record<AbcRating, Record<AbcRating, number>> = {
      A: { A: 0, B: 0, C: 0 },
      B: { A: 0, B: 0, C: 0 },
      C: { A: 0, B: 0, C: 0 },
    };
    for (const d of details) m[d.RatingFatturato][d.RatingProfitto]++;
    return m;
  }, [details]);

  // ── Sortable table ────────────────────────────────────────────────────────
  const sortedDetails = useMemo(() => [...details].sort((a, b) => {
    const va = a[sortKey as keyof AbcResult];
    const vb = b[sortKey as keyof AbcResult];
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb, 'it');
    return sortDir === 'desc' ? -cmp : cmp;
  }), [details, sortKey, sortDir]);

  const aiComment = useMemo(() => buildAiComment(summary, details), [summary, details]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8 max-w-7xl">

      {/* ── Header + tolerance control ──────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Analisi ABC — Classificazione Referenze</h2>
          <p className="text-sm text-slate-500 mt-1">
            {summary.NumReferenze} referenze · dataset demo 2025–2026
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3.5 shadow-sm">
          <SlidersHorizontal className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Tolleranza Rating Profitto
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={20} step={1}
                value={profitTolerance}
                onChange={e => setProfitTolerance(Number(e.target.value))}
                className="w-32 accent-blue-600 cursor-pointer"
              />
              <span className="text-sm font-bold text-blue-600 w-12 tabular-nums">
                ± {profitTolerance} pp
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'Fatturato Totale',
            value: fmtEur.format(summary.TotaleFatturato),
            sub:   `${fmtInt.format(summary.TotaleQuantita)} unità vendute`,
            vClass: 'text-slate-900',
          },
          {
            label: 'Margine Totale',
            value: fmtEur.format(summary.TotaleMargine),
            sub:   `Costo: ${fmtEur.format(summary.TotaleCosto)}`,
            vClass: summary.TotaleMargine >= 0 ? 'text-emerald-600' : 'text-red-600',
          },
          {
            label: 'Margine %',
            value: fmtPct(summary.MarginePercGlobale),
            sub:   'Media ponderata aziendale',
            vClass: summary.MarginePercGlobale >= 0 ? 'text-emerald-600' : 'text-red-600',
          },
          {
            label: 'Quantità Totale',
            value: fmtInt.format(summary.TotaleQuantita),
            sub:   `A: ${summary.CountA}  ·  B: ${summary.CountB}  ·  C: ${summary.CountC} referenze`,
            vClass: 'text-slate-900',
          },
        ].map(({ label, value, sub, vClass }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
            <p className={`text-2xl font-bold ${vClass} leading-none tabular-nums`}>{value}</p>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Scatter chart + 3×3 Matrix ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Scatter — custom SVG (no Recharts, avoids React 19 ref incompatibility) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">Mappa Fatturato vs Margine %</h3>
          <p className="text-xs text-slate-400 mb-4 mt-0.5">Colore = Rating Finale · passa sopra un punto per i dettagli</p>
          <CustomScatterPlot groups={scatterGroups} />
        </div>

        {/* 3×3 Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-slate-700">Matrice Fatturato × Profitto</h3>
          <p className="text-xs text-slate-400 mb-5 mt-0.5">
            N° referenze per combinazione di rating · cella colorata = Rating Finale
          </p>

          {/* Column headers */}
          <div className="flex mb-2 pl-14 gap-2">
            {RATINGS.map(rev => (
              <div key={rev} className="flex-1 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Fatt. {rev}
                </span>
              </div>
            ))}
          </div>

          {/* Matrix rows — one row per Profit rating */}
          <div className="flex flex-col gap-2 flex-1">
            {RATINGS.map(prof => (
              <div key={prof} className="flex items-stretch gap-2 flex-1">
                {/* Row label */}
                <div className="w-12 flex items-center justify-end flex-shrink-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Prof. {prof}
                  </span>
                </div>

                {/* 3 cells */}
                {RATINGS.map(rev => {
                  const finalR = FINAL_RATING[rev][prof];
                  const count  = matrixCounts[rev][prof];
                  return (
                    <div
                      key={rev}
                      className={`
                        flex-1 rounded-xl border flex flex-col items-center justify-center
                        py-3 transition-opacity ${CELL_BG[finalR]}
                        ${count === 0 ? 'opacity-35' : ''}
                      `}
                    >
                      <span className="text-3xl font-bold leading-none tabular-nums">
                        {count}
                      </span>
                      <span className="text-[10px] font-semibold mt-1.5 opacity-60 tracking-wide">
                        {rev}{prof} → {finalR}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
            {RATINGS.map(r => (
              <span key={r} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${RATING_BADGE[r]}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Classe {r}
              </span>
            ))}
            <span className="text-[10px] text-slate-400 self-center ml-1">
              · Celle opache = 0 referenze
            </span>
          </div>
        </div>
      </div>

      {/* ── Detail table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Dettaglio Referenze</h3>
          <span className="text-xs text-slate-400">Clicca intestazione per ordinare</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`
                      px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest
                      whitespace-nowrap select-none
                      ${key ? 'cursor-pointer hover:text-slate-600 transition-colors' : ''}
                    `}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {key && (
                        <ChevronsUpDown
                          className={`w-3 h-3 ${sortKey === key ? 'text-blue-500' : 'text-slate-300'}`}
                        />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedDetails.map(d => (
                <tr key={d.Referenza} className="hover:bg-slate-50/70 transition-colors group">
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-400 group-hover:text-slate-600">
                    {d.Referenza}
                  </td>
                  <td className="px-5 py-3.5 text-slate-800 font-medium max-w-52 truncate">
                    {d.Descrizione}
                  </td>
                  <td className="px-5 py-3.5 text-slate-700 font-semibold tabular-nums">
                    {fmtEur.format(d.Fatturato)}
                  </td>
                  <td className={`px-5 py-3.5 font-semibold tabular-nums ${d.Margine >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {fmtEur.format(d.Margine)}
                  </td>
                  <td className={`px-5 py-3.5 font-bold tabular-nums ${d.MarginePerc >= summary.MarginePercGlobale ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {fmtPct(d.MarginePerc)}
                  </td>
                  <td className="px-5 py-3.5"><RatingBadge rating={d.RatingFatturato} /></td>
                  <td className="px-5 py-3.5"><RatingBadge rating={d.RatingProfitto} /></td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${RATING_BADGE[d.RatingFinale]}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {d.RatingFinale}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Comments ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">

        {/* AI comment */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <MessageSquareText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Analisi AI</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Generata in tempo reale dai dati correnti</p>
            </div>
          </div>

          <div className="flex-1 text-sm text-slate-300 leading-relaxed whitespace-pre-line font-light">
            {aiComment}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              Tolleranza attiva: ± {profitTolerance} pp · Margine medio: {fmtPct(summary.MarginePercGlobale)}
            </p>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-500">
              Demo
            </span>
          </div>
        </div>

        {/* User note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Note Aziendali</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Considerazioni e decisioni del management</p>
            </div>
          </div>

          <textarea
            value={userNote}
            onChange={e => setUserNote(e.target.value)}
            placeholder="Inserisci considerazioni, decisioni operative o commenti strategici sull'analisi ABC..."
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
