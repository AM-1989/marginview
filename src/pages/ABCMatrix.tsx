import { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  Upload, Download, RotateCcw, Package, TrendingUp, ChartColumn,
  Target, Activity, Percent, Star, TriangleAlert, Users, Heart,
  Zap, Sparkles, Layers, CheckCircle2, AlertTriangle, Info,
  ChevronDown, ChevronUp, GitCompare,
} from 'lucide-react';
import {
  calculate, aggregateRows, parseGenericRows, whatIfSimulate,
  buildMigration, SEGMENTS,
  type ClassifiedRow, type SegmentKey, type MigrationSummary,
} from '../lib/abcMatrixCalc';
import { mockRows } from '../lib/mockData';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur  = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtK    = (v: number) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : fmtEur.format(v);
const fmtPct  = (v: number) => `${isFinite(v) ? v.toFixed(1) : '0.0'}%`;
const fmtDiff = (v: number) => `${v >= 0 ? '+' : ''}${fmtPct(v)}`;

// ── Segment colors ────────────────────────────────────────────────────────────
const SEG_STYLE: Record<SegmentKey, { bg: string; text: string; border: string }> = {
  AA: { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
  AB: { bg: 'bg-emerald-50/50', text: 'text-slate-700', border: 'border-emerald-100' },
  AC: { bg: 'bg-red-50/60',   text: 'text-slate-700',   border: 'border-red-100'   },
  BA: { bg: 'bg-emerald-50/50', text: 'text-slate-700', border: 'border-emerald-100' },
  BB: { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200' },
  BC: { bg: 'bg-red-50/60',   text: 'text-slate-700',   border: 'border-red-100'   },
  CA: { bg: 'bg-slate-50',    text: 'text-slate-600',   border: 'border-slate-200' },
  CB: { bg: 'bg-red-50/40',   text: 'text-slate-600',   border: 'border-red-100'   },
  CC: { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200'   },
};

// ── Excel helpers ─────────────────────────────────────────────────────────────
async function readExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ── Scatter custom SVG ────────────────────────────────────────────────────────
const DOT_COLOR: Record<SegmentKey, string> = {
  AA: '#10b981', AB: '#34d399', AC: '#f87171',
  BA: '#6ee7b7', BB: '#f59e0b', BC: '#fb923c',
  CA: '#a7f3d0', CB: '#fcd34d', CC: '#ef4444',
};

function ScatterMatrix({ products }: { products: ClassifiedRow[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; p: ClassifiedRow } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!products.length) return <div className="h-64 flex items-center justify-center text-sm text-slate-400">Nessun dato</div>;

  const W = 400, H = 220, PAD = { t: 12, r: 12, b: 32, l: 56 };
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;

  const xs = products.map(p => p.revenue);
  const ys = products.map(p => p.marginPct);
  const dx = Math.max(...xs) - Math.min(...xs) || 1;
  const dy = Math.max(...ys) - Math.min(...ys) || 1;
  const x0 = Math.min(...xs) - dx * 0.08, x1 = Math.max(...xs) + dx * 0.08;
  const y0 = Math.min(...ys) - dy * 0.14, y1 = Math.max(...ys) + dy * 0.14;

  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * ph;
  const ticks4 = (min: number, max: number) => Array.from({ length: 4 }, (_, i) => min + (max - min) * (i + 1) / 4);

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {ticks4(y0, y1).map((t, i) => (
          <line key={i} x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {ticks4(x0, x1).map((t, i) => (
          <line key={i} x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {ticks4(x0, x1).map((t, i) => (
          <text key={i} x={sx(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">{fmtK(t)}</text>
        ))}
        {ticks4(y0, y1).map((t, i) => (
          <text key={i} x={PAD.l - 4} y={sy(t) + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{t.toFixed(0)}%</text>
        ))}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth={1} />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth={1} />
        {products.map((p, i) => (
          <circle key={i} cx={sx(p.revenue)} cy={sy(p.marginPct)} r={5}
            fill={DOT_COLOR[p.segment]} fillOpacity={0.8} stroke="white" strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => {
              const rect = ref.current?.getBoundingClientRect();
              if (!rect) return;
              setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 30, p });
            }}
          />
        ))}
      </svg>
      {tip && (
        <div className="absolute z-10 pointer-events-none bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs min-w-44"
          style={{ left: tip.x, top: tip.y }}>
          <p className="font-semibold text-slate-800 truncate">{tip.p.name}</p>
          <p className="text-slate-400 text-[10px]">{tip.p.id}</p>
          <div className="mt-1.5 space-y-0.5 text-slate-600">
            <p>Fatturato: <strong>{fmtK(tip.p.revenue)}</strong></p>
            <p>Margine: <strong>{fmtPct(tip.p.marginPct)}</strong></p>
            <p>Segmento: <strong>{tip.p.segment} — {SEGMENTS[tip.p.segment].label}</strong></p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────
function DropZone({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
      }`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1" />
      <p className="text-xs text-slate-500">{label}</p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ABCMatrix() {
  const [rows, setRows]                       = useState(() => aggregateRows(mockRows));
  const [compRows, setCompRows]               = useState<ClassifiedRow[] | null>(null);
  const [activeTab, setActiveTab]             = useState<'prodotti' | 'categorie'>('prodotti');
  const [thresholdA, setThresholdA]           = useState(10);
  const [thresholdC, setThresholdC]           = useState(10);
  const [customMarginOn, setCustomMarginOn]   = useState(false);
  const [customMarginVal, setCustomMarginVal] = useState(20);
  const [whatIfExcl, setWhatIfExcl]           = useState<SegmentKey[]>([]);
  const [catSort, setCatSort]                 = useState<'fatturato' | 'margine'>('fatturato');
  const [catDir, setCatDir]                   = useState<'top' | 'bottom'>('top');
  const [selectedCell, setSelectedCell]       = useState<SegmentKey | null>(null);
  const [expandedAction, setExpandedAction]   = useState<number | null>(null);
  const [loadingFile, setLoadingFile]         = useState(false);

  // ── Core calculation ───────────────────────────────────────────────────────
  const metrics = useMemo(
    () => calculate(rows, thresholdA, thresholdC, customMarginOn ? customMarginVal : null),
    [rows, thresholdA, thresholdC, customMarginOn, customMarginVal],
  );

  const { products, totalRevenue, totalProfit, weightedMargin,
    gini, paretoIndex, starRevenuePct, riskRevenuePct, belowAvgCount,
    matrix, paretoData, categories, health, actions } = metrics;

  // ── What-if ────────────────────────────────────────────────────────────────
  const whatIf     = useMemo(() => whatIfSimulate(products, whatIfExcl), [products, whatIfExcl]);
  const whatIfBase = useMemo(() => whatIfSimulate(products, []), [products]);

  // ── Migration ──────────────────────────────────────────────────────────────
  const migration: MigrationSummary | null = useMemo(
    () => compRows ? buildMigration(compRows, products) : null,
    [compRows, products],
  );

  // ── File handlers ──────────────────────────────────────────────────────────
  async function handleMainFile(file: File) {
    setLoadingFile(true);
    try {
      const rawRows = await readExcel(file);
      const parsed  = parseGenericRows(rawRows);
      setRows(parsed);
      setSelectedCell(null);
    } catch { alert('Errore lettura file. Assicurati che sia un Excel valido.'); }
    finally { setLoadingFile(false); }
  }

  async function handleCompFile(file: File) {
    try {
      const rawRows = await readExcel(file);
      const parsed  = parseGenericRows(rawRows);
      const calcComp = calculate(parsed, thresholdA, thresholdC, customMarginOn ? customMarginVal : null);
      setCompRows(calcComp.products);
    } catch { alert('Errore lettura file di confronto.'); }
  }

  function handleExport() {
    const data = products.map(p => ({
      Codice:          p.id,
      Descrizione:     p.name,
      Categoria:       p.category,
      Fatturato:       p.revenue,
      Costo:           p.cost,
      Profitto:        p.profit,
      'Margine%':      +p.marginPct.toFixed(2),
      'Cum.Rev%':      +p.cumRevenuePct.toFixed(2),
      'Rating Fatt.':  p.ratingRevenue,
      'Rating Marg.':  p.ratingMargin,
      Segmento:        p.segment,
      'Nome Segmento': SEGMENTS[p.segment].label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ABC Matrix');
    XLSX.writeFile(wb, 'abc-matrix.xlsx');
  }

  // ── Segment products drill-down ────────────────────────────────────────────
  const cellProducts = selectedCell ? products.filter(p => p.segment === selectedCell) : null;

  // ── Top/Bottom categories ──────────────────────────────────────────────────
  const catSorted = [...categories]
    .sort((a, b) => catSort === 'fatturato' ? b.revenue - a.revenue : b.marginPct - a.marginPct);
  const topCats    = catSorted.slice(0, 5);
  const bottomCats = [...catSorted].reverse().slice(0, 5);
  const shownCats  = catDir === 'top' ? topCats : bottomCats;

  // ── SEGMENTS grid order ───────────────────────────────────────────────────
  const MATRIX_ORDER: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ChartColumn className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Matrice ABC</h1>
            <p className="text-xs text-slate-500">Analisi Fatturato × Margine · {products.length} prodotti</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Drag-to-load strip */}
          <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {loadingFile ? 'Caricamento…' : 'Carica Excel'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleMainFile(f); e.target.value = ''; }} />
          </label>
          <button onClick={() => { setRows(aggregateRows(mockRows)); setCompRows(null); setSelectedCell(null); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Demo
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Esporta Excel
          </button>
        </div>
      </div>

      {/* ── Tab ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {(['prodotti', 'categorie'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'prodotti' ? <Package className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── KPI Cards (top 4) ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Package,     label: 'Prodotti',       value: products.length.toString(),         sub: `${categories.length} categorie` },
          { icon: TrendingUp,  label: 'Fatturato Totale', value: fmtK(totalRevenue),              sub: `Costo: ${fmtK(totalRevenue - totalProfit)}` },
          { icon: ChartColumn, label: 'Margine Medio',  value: products.length ? fmtPct(weightedMargin) : 'N/A', sub: `Profitto: ${fmtK(totalProfit)}` },
          { icon: Target,      label: 'Star (A/A)',      value: `${matrix.AA.count} / ${products.filter(p => p.ratingRevenue === 'A').length} classe A`,
            sub: `${fmtPct(starRevenuePct)} del fatturato` },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Icon className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-xl font-bold tabular-nums">{value}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Secondary KPIs (6 cards) ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Activity,       label: 'Concentrazione (Gini)', value: gini.toFixed(2), sub: gini < 0.3 ? 'Distribuita' : gini < 0.6 ? 'Media' : 'Concentrata', color: 'text-emerald-600' },
          { icon: Percent,        label: 'Margine Medio Pesato', value: fmtPct(weightedMargin), sub: `Profitto: ${fmtK(totalProfit)}`, color: 'text-slate-800' },
          { icon: TrendingUp,     label: 'Indice Pareto', value: fmtPct(paretoIndex), sub: "Prodotti che fanno l'80%", color: 'text-blue-600' },
          { icon: Star,           label: 'Fatturato Star', value: fmtPct(starRevenuePct), sub: 'Cella A-A', color: 'text-emerald-600' },
          { icon: TriangleAlert,  label: 'Fatturato a Rischio', value: fmtPct(riskRevenuePct), sub: 'Margine basso (A-C/B-C)', color: riskRevenuePct > 20 ? 'text-red-500' : 'text-slate-700' },
          { icon: Users,          label: 'Prodotti Sotto Media', value: belowAvgCount.toString(), sub: `su ${products.length} totali`, color: 'text-slate-600' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Matrix + Settings ───────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-6">

        {/* 3×3 Matrix */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-4">
            Matrice ABC — Fatturato × Margine
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {/* Header row */}
            <div className="flex items-end pb-2">
              <span className="text-xs text-slate-400">Fatt. ↓ / Marg. →</span>
            </div>
            {['Margine A', 'Margine B', 'Margine C'].map(h => (
              <div key={h} className="text-center pb-2">
                <span className="text-sm font-bold text-slate-700">{h}</span>
              </div>
            ))}
            {/* Rows */}
            {(['A', 'B', 'C'] as const).map(rev => (
              <>
                <div key={`lbl-${rev}`} className="flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-700">Fatt. {rev}</span>
                </div>
                {(['A', 'B', 'C'] as const).map(marg => {
                  const key = `${rev}${marg}` as SegmentKey;
                  const cell = matrix[key];
                  const s = SEG_STYLE[key];
                  const isSelected = selectedCell === key;
                  return (
                    <button key={key}
                      onClick={() => setSelectedCell(isSelected ? null : key)}
                      className={`rounded-lg border p-3 transition-all hover:scale-[1.02] hover:shadow-md text-center ${s.bg} ${s.border} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
                      <div className="text-xs font-medium opacity-70">
                        {SEGMENTS[key].label} {SEGMENTS[key].emoji}
                      </div>
                      <div className={`text-2xl font-bold mt-1 ${s.text}`}>{cell.count}</div>
                      <div className="text-xs mt-1 text-slate-500">
                        {fmtPct(cell.revenuePct)} · {fmtK(cell.revenue)}
                      </div>
                    </button>
                  );
                })}
              </>
            ))}
          </div>
          {/* Clicked cell drill-down */}
          {selectedCell && cellProducts && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Prodotti {selectedCell} — {SEGMENTS[selectedCell].label} ({cellProducts.length})
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {cellProducts.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-50">
                    <span className="text-slate-600 truncate max-w-[200px]">{p.name}</span>
                    <span className="font-medium text-slate-800 ml-2 flex-shrink-0">{fmtK(p.revenue)} · {fmtPct(p.marginPct)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Impostazioni Margine</h3>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Riferimento media</label>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${customMarginOn ? 'bg-slate-300' : 'bg-blue-500'}`} />
              <span className="text-xs">{customMarginOn ? `${customMarginVal.toFixed(1)}% personalizzato` : 'Media pesata dai dati'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Margine personalizzato</label>
            <button onClick={() => setCustomMarginOn(v => !v)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${customMarginOn ? 'bg-blue-500' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${customMarginOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {customMarginOn && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Valore %</label>
              <input type="number" value={customMarginVal} onChange={e => setCustomMarginVal(+e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:border-blue-400" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Soglia A (pp sopra media)</label>
              <input type="number" value={thresholdA} onChange={e => setThresholdA(+e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Soglia C (pp sotto media)</label>
              <input type="number" value={thresholdC} onChange={e => setThresholdC(+e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Media pesata: {fmtPct(weightedMargin)} · A = ≥ +{thresholdA}pp · C = ≤ -{thresholdC}pp
          </p>

          {/* Comparison file upload */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <GitCompare className="w-3.5 h-3.5" /> Confronto Periodi
              </p>
              {compRows && (
                <button onClick={() => setCompRows(null)} className="text-[10px] text-slate-400 hover:text-slate-600">✕ rimuovi</button>
              )}
            </div>
            {!compRows ? (
              <DropZone onFile={handleCompFile} label="Carica file periodo precedente" />
            ) : (
              <p className="text-[11px] text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                ✓ {compRows.length} prodotti caricati per confronto
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Period comparison (migration) ───────────────────────────────────── */}
      {migration && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Confronto tra Periodi</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Δ Fatturato',    value: fmtDiff(migration.deltaRevenue / Math.abs(migration.deltaRevenue - migration.deltaRevenue || 1) * 100), sub: fmtK(migration.deltaRevenue) },
              { label: 'Δ Profitto',     value: fmtDiff(migration.deltaProfit  / 1 * 100), sub: fmtK(migration.deltaProfit) },
              { label: 'Δ Margine',      value: `${migration.deltaMargin >= 0 ? '+' : ''}${migration.deltaMargin.toFixed(1)}pp`, sub: '' },
              { label: 'Nuovi prodotti', value: `+${migration.newItems}`, sub: '' },
              { label: 'Prodotti usciti', value: `-${migration.dropped}`, sub: '' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="border rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                <p className="text-base font-bold tabular-nums mt-1">{value}</p>
                {sub && <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, label: 'Migliorati',  value: migration.improved,  color: 'text-emerald-600' },
              { icon: Activity,   label: 'Stabili',     value: migration.stable,    color: 'text-amber-500'   },
              { icon: ChevronDown, label: 'Peggiorati', value: migration.worsened,  color: 'text-red-500'     },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="border rounded-lg p-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compRows && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">
          Carica un secondo file nelle impostazioni per vedere la migration matrix e i prodotti che sono cresciuti o peggiorati
        </div>
      )}

      {/* ── Pareto + Top/Bottom ──────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Pareto curve */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Curva di Pareto</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Concentrazione del fatturato per prodotto</p>
            </div>
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{fmtPct(paretoIndex)}</span> dei prodotti = 80% del fatturato
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={paretoData} margin={{ top: 5, right: 10, bottom: 20, left: 5 }}>
              <defs>
                <linearGradient id="paretoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="productPct" tickFormatter={v => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]}
                contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} />
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 3"
                label={{ value: '80%', position: 'right', fontSize: 10, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="revenuePct" stroke="#10b981" fill="url(#paretoGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top/Bottom categories */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Top / Bottom Categorie</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{categories.length} categorie totali</p>
            </div>
            <div className="flex gap-2">
              {(['fatturato', 'margine'] as const).map(s => (
                <button key={s} onClick={() => setCatSort(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${catSort === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              {(['top', 'bottom'] as const).map(d => (
                <button key={d} onClick={() => setCatDir(d)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${catDir === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={shownCats} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={catSort === 'fatturato' ? v => fmtK(v) : v => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" width={80}
                tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => catSort === 'fatturato' ? [fmtEur.format(Number(v))] : [`${Number(v).toFixed(1)}%`]}
                contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} />
              <Bar dataKey={catSort === 'fatturato' ? 'revenue' : 'marginPct'} radius={[0, 4, 4, 0]} maxBarSize={24}>
                {shownCats.map((_, i) => (
                  <Cell key={i} fill={catDir === 'top' ? '#3b82f6' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Health Score + Action Items ──────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">

        {/* Health Score */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Health Score</h3>
          </div>
          <div className="text-center space-y-1">
            <div className={`text-6xl font-bold tabular-nums ${
              health.total >= 70 ? 'text-emerald-600' : health.total >= 45 ? 'text-amber-500' : 'text-red-500'
            }`}>{health.total}</div>
            <div className="text-sm text-slate-500">su 100</div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-2 ${
              health.total >= 70 ? 'border-emerald-300 text-emerald-700' :
              health.total >= 45 ? 'border-amber-300 text-amber-700' : 'border-red-300 text-red-700'
            }`}>
              {health.total >= 70 ? 'A — Ottimo' : health.total >= 45 ? 'B — Nella norma' : 'C — Da migliorare'}
            </span>
          </div>
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {[
              { label: 'Diversificazione', score: health.diversification, desc: `Gini ${gini.toFixed(2)} — ${gini < 0.3 ? 'distribuzione equilibrata' : gini < 0.6 ? 'concentrazione media' : 'alta concentrazione'}` },
              { label: 'Prodotti Star',    score: health.starScore,       desc: `${fmtPct(starRevenuePct)} fatturato in A-A` },
              { label: 'Esposizione Rischio', score: health.riskScore,   desc: `${fmtPct(riskRevenuePct)} fatturato a basso margine` },
              { label: 'Profittabilità',   score: health.profitability,   desc: `Margine medio ${fmtPct(weightedMargin)}` },
              { label: 'Resilienza',       score: health.resilience,      desc: `${fmtPct(paretoIndex)} prodotti fanno l'80%` },
            ].map(({ label, score, desc }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="tabular-nums text-slate-500">{score}/100</span>
                </div>
                <ProgressBar value={score} color={score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-400' : 'bg-red-400'} />
                <p className="text-[10px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Action Items</h3>
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 ml-1">
              {actions.length}
            </span>
          </div>
          {actions.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Nessuna azione critica rilevata. Portafoglio bilanciato!
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map((a, i) => {
                const Icon = a.level === 'error' ? TriangleAlert : a.level === 'warning' ? AlertTriangle : a.level === 'success' ? CheckCircle2 : Info;
                const col  = a.level === 'error' ? 'text-red-500' : a.level === 'warning' ? 'text-amber-500' : a.level === 'success' ? 'text-emerald-500' : 'text-blue-500';
                const bg   = a.level === 'error' ? 'bg-red-50 border-red-200' : a.level === 'warning' ? 'bg-amber-50 border-amber-200' : a.level === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200';
                return (
                  <div key={i} className={`border rounded-xl p-3 ${bg} cursor-pointer`}
                    onClick={() => setExpandedAction(expandedAction === i ? null : i)}>
                    <div className="flex items-start gap-2.5">
                      <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${col}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                        {expandedAction === i && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.description}</p>
                        )}
                      </div>
                      {expandedAction === i ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── What-if ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">What-if: simulatore di razionalizzazione</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Seleziona i segmenti da eliminare per stimare l'impatto</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {MATRIX_ORDER.map(key => {
            const cell = matrix[key];
            const selected = whatIfExcl.includes(key);
            return (
              <button key={key}
                onClick={() => setWhatIfExcl(prev => selected ? prev.filter(k => k !== key) : [...prev, key])}
                disabled={cell.count === 0}
                className={`border rounded-lg p-2 text-center transition-all ${
                  cell.count === 0 ? 'opacity-30 cursor-not-allowed' :
                  selected ? 'border-red-400 bg-red-50 ring-1 ring-red-300' : 'hover:border-slate-300'
                }`}>
                <div className="text-[10px] font-semibold">{SEGMENTS[key].label} {SEGMENTS[key].emoji}</div>
                <div className="text-[10px] text-slate-400">{cell.count > 0 ? `${cell.count} prod · ${fmtK(cell.revenue)}` : 'vuoto'}</div>
                {selected && <div className="text-[9px] text-red-500 font-semibold mt-0.5">✕ ESCLUSO</div>}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
          {[
            { label: 'Fatturato', curr: whatIf.revenue, base: whatIfBase.revenue, fmt: fmtK },
            { label: 'Profitto',  curr: whatIf.profit,  base: whatIfBase.profit,  fmt: fmtK },
            { label: 'Margine medio', curr: whatIf.marginPct, base: whatIfBase.marginPct, fmt: fmtPct },
          ].map(({ label, curr, base, fmt }) => {
            const delta    = base > 0 ? (curr - base) / base * 100 : 0;
            const deltaAbs = curr - base;
            return (
              <div key={label} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                <p className="text-lg font-bold tabular-nums mt-1">{fmt(curr)}</p>
                <p className="text-[10px] text-slate-400 tabular-nums">era {fmt(base)}</p>
                <p className={`text-xs font-semibold tabular-nums mt-1 ${deltaAbs < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {fmtDiff(delta)}
                </p>
                <p className="text-[10px] tabular-nums mt-0.5 text-slate-400">
                  {deltaAbs >= 0 ? '+' : ''}{label === 'Margine medio' ? `${deltaAbs.toFixed(1)}pp` : fmtK(deltaAbs)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scatter ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-4">Scatter — Fatturato vs Margine</h3>
        <ScatterMatrix products={products} />
      </div>

      {/* ── Product table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Dettaglio Prodotti</h3>
          <span className="text-xs text-slate-400 ml-1">{products.length} prodotti classificati</span>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                {['Codice','Descrizione','Categoria','Fatturato','Margine%','Profitto','Fatt.ABC','Marg.ABC','Segmento'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map(p => {
                const s = SEG_STYLE[p.segment];
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-slate-400">{p.id}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700 max-w-48 truncate">{p.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.category || '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium">{fmtK(p.revenue)}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${p.marginPct >= weightedMargin ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtPct(p.marginPct)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{fmtK(p.profit)}</td>
                    <td className="px-4 py-2.5"><span className="font-bold text-slate-700">{p.ratingRevenue}</span></td>
                    <td className="px-4 py-2.5"><span className="font-bold text-slate-700">{p.ratingMargin}</span></td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>
                        {p.segment} {SEGMENTS[p.segment].emoji}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
