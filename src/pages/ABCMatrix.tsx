import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  Upload, Download, RotateCcw, Package, TrendingUp, ChartColumn,
  Target, Activity, Percent, Star, TriangleAlert, Users, Heart,
  Zap, Sparkles, CheckCircle2, AlertTriangle,
  ChevronDown, Loader2, DollarSign, Shield,
  Minus, Eye, Search, AlertCircle, GitCompare, Layers,
} from 'lucide-react';
import {
  calculate, parseGenericRows, whatIfSimulate,
  buildMigration, aggregateByCategory, SEGMENTS,
  type AnalysisRow, type ClassifiedRow, type SegmentKey, type MigrationSummary,
} from '../lib/abcMatrixCalc';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur  = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtK    = (v: number) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : fmtEur.format(v);
const fmtPct  = (v: number) => `${isFinite(v) ? v.toFixed(1) : '0.0'}%`;
const fmtDiff = (v: number) => `${v >= 0 ? '+' : ''}${fmtPct(v)}`;
const fmtImpact = (v: number) => {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `€${v.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`;
  return fmtEur.format(v);
};

// ── Segment visual config ─────────────────────────────────────────────────────
const SEG_STYLE: Record<SegmentKey, { bg: string; text: string; border: string; badgeBg: string; badgeText: string; leftBorder: string }> = {
  AA: { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', badgeBg: 'bg-emerald-500', badgeText: 'text-white', leftBorder: 'border-l-emerald-500' },
  AB: { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   badgeBg: 'bg-amber-400',   badgeText: 'text-white', leftBorder: 'border-l-amber-400'   },
  AC: { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     badgeBg: 'bg-red-500',     badgeText: 'text-white', leftBorder: 'border-l-red-500'     },
  BA: { bg: 'bg-emerald-50/60', text: 'text-emerald-700', border: 'border-emerald-100', badgeBg: 'bg-emerald-400', badgeText: 'text-white', leftBorder: 'border-l-emerald-400' },
  BB: { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   badgeBg: 'bg-amber-400',   badgeText: 'text-white', leftBorder: 'border-l-amber-400'   },
  BC: { bg: 'bg-red-50/60',   text: 'text-red-600',     border: 'border-red-100',     badgeBg: 'bg-red-400',     badgeText: 'text-white', leftBorder: 'border-l-red-400'     },
  CA: { bg: 'bg-emerald-50/40', text: 'text-emerald-700', border: 'border-emerald-100', badgeBg: 'bg-emerald-300', badgeText: 'text-emerald-900', leftBorder: 'border-l-emerald-300' },
  CB: { bg: 'bg-slate-50',    text: 'text-slate-600',   border: 'border-slate-200',   badgeBg: 'bg-amber-300',   badgeText: 'text-amber-900', leftBorder: 'border-l-amber-300'   },
  CC: { bg: 'bg-red-50/40',   text: 'text-red-600',     border: 'border-red-100',     badgeBg: 'bg-red-400',     badgeText: 'text-white', leftBorder: 'border-l-red-400'     },
};

const TREEMAP_COLORS: Record<SegmentKey, string> = {
  AA: '#10b981', AB: '#f59e0b', AC: '#ef4444',
  BA: '#34d399', BB: '#fbbf24', BC: '#f87171',
  CA: '#6ee7b7', CB: '#fcd34d', CC: '#fca5a5',
};

const DOT_COLOR: Record<SegmentKey, string> = {
  AA: '#10b981', AB: '#f59e0b', AC: '#ef4444',
  BA: '#34d399', BB: '#fbbf24', BC: '#f87171',
  CA: '#6ee7b7', CB: '#fcd34d', CC: '#fca5a5',
};

const SEGMENT_ICONS: Record<SegmentKey, React.ElementType> = {
  AA: Star, AB: DollarSign, AC: TriangleAlert,
  BA: TrendingUp, BB: Minus, BC: Shield,
  CA: Zap, CB: Eye, CC: Eye,
};

const MATRIX_ORDER: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];

// ── Excel reader ──────────────────────────────────────────────────────────────
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

// ── Treemap layout ────────────────────────────────────────────────────────────
interface TRect { key: SegmentKey; revenue: number; x: number; y: number; w: number; h: number; }

function squarify(
  items: { key: SegmentKey; revenue: number }[],
  x: number, y: number, w: number, h: number, total: number,
): TRect[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];
  let cum = 0;
  let split = Math.ceil(items.length / 2);
  const half = total / 2;
  for (let i = 0; i < items.length; i++) {
    cum += items[i].revenue;
    if (cum >= half) { split = i + 1; break; }
  }
  const left  = items.slice(0, split);
  const right = items.slice(split);
  const lTot  = left.reduce((s, i) => s + i.revenue, 0);
  const rTot  = right.reduce((s, i) => s + i.revenue, 0);
  const ratio = total > 0 ? lTot / total : 0.5;
  if (w >= h) {
    const w1 = w * ratio;
    return [...squarify(left, x, y, w1, h, lTot), ...squarify(right, x + w1, y, w - w1, h, rTot)];
  }
  const h1 = h * ratio;
  return [...squarify(left, x, y, w, h1, lTot), ...squarify(right, x, y + h1, w, h - h1, rTot)];
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%` }} />
    </div>
  );
}

// ── SegmentBadge ──────────────────────────────────────────────────────────────
function SegmentBadge({ seg }: { seg: SegmentKey }) {
  const s = SEG_STYLE[seg];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${s.badgeBg} ${s.badgeText}`}>
      {seg.charAt(0)}-{seg.charAt(1)}
    </span>
  );
}

// ── ScatterMatrix ─────────────────────────────────────────────────────────────
function ScatterMatrix({ products }: { products: ClassifiedRow[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; p: ClassifiedRow } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!products.length) return <div className="h-64 flex items-center justify-center text-sm text-slate-400">Nessun dato</div>;
  const W = 460, H = 280, PAD = { t: 16, r: 16, b: 40, l: 56 };
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
        {ticks4(y0, y1).map((t, i) => <line key={i} x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} stroke="#f1f5f9" strokeWidth={1} />)}
        {ticks4(x0, x1).map((t, i) => <line key={i} x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} stroke="#f1f5f9" strokeWidth={1} />)}
        {ticks4(x0, x1).map((t, i) => <text key={i} x={sx(t)} y={H - PAD.b + 18} textAnchor="middle" fontSize={9} fill="#94a3b8">{fmtK(t)}</text>)}
        {ticks4(y0, y1).map((t, i) => <text key={i} x={PAD.l - 4} y={sy(t) + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{t.toFixed(0)}%</text>)}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">Fatturato (€) →</text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize={9} fill="#94a3b8" transform={`rotate(-90 12 ${H / 2})`}>Margine (%) →</text>
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth={1} />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth={1} />
        {products.map((p, i) => (
          <circle key={i} cx={sx(p.revenue)} cy={sy(p.marginPct)} r={5}
            fill={DOT_COLOR[p.segment]} fillOpacity={0.8} stroke="white" strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => { const rect = ref.current?.getBoundingClientRect(); if (!rect) return; setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 30, p }); }}
          />
        ))}
      </svg>
      {tip && (
        <div className="absolute z-10 pointer-events-none bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs min-w-44" style={{ left: tip.x, top: tip.y }}>
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

// ── ProductCard ───────────────────────────────────────────────────────────────
function ProductCard({ p }: { p: ClassifiedRow }) {
  const s = SEG_STYLE[p.segment];
  const isGood = p.marginPct >= 0;
  return (
    <div className={`rounded-lg border p-2.5 ${s.bg} ${s.border}`}>
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="text-[11px] font-medium text-slate-700 leading-tight line-clamp-2 flex-1">{p.id} — {p.name}</p>
        <SegmentBadge seg={p.segment} />
      </div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-800">{fmtK(p.revenue)}</span>
        <span className={`font-semibold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>{fmtPct(p.marginPct)}</span>
      </div>
      <ProgressBar value={Math.max(0, p.marginPct)} max={50} color={isGood ? 'bg-emerald-500' : 'bg-red-400'} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ABCMatrix() {
  const [rows, setRows]                       = useState<AnalysisRow[] | null>(null);
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
  const [loadingFile, setLoadingFile]         = useState(false);
  const [uploadDragging, setUploadDragging]   = useState(false);
  const [heatmapFilter, setHeatmapFilter]     = useState<SegmentKey | null>(null);
  const [expandedCats, setExpandedCats]       = useState<Set<string>>(new Set());
  const [heatSearch, setHeatSearch]           = useState('');
  const [alertFilter, setAlertFilter]         = useState<'all' | 'critical' | 'warning' | 'opportunity'>('all');
  const [expandedSegments, setExpandedSegments] = useState<Set<SegmentKey>>(new Set());
  const [parseWarnings, setParseWarnings]       = useState<string[]>([]);
  const uploadInputRef  = useRef<HTMLInputElement>(null);
  const mainInputRef    = useRef<HTMLInputElement>(null);

  // ── Calculations ──────────────────────────────────────────────────────────
  const metrics = useMemo(
    () => calculate(rows ?? [], thresholdA, thresholdC, customMarginOn ? customMarginVal : null),
    [rows, thresholdA, thresholdC, customMarginOn, customMarginVal],
  );

  const categoryMetrics = useMemo(
    () => calculate(aggregateByCategory(rows ?? []), thresholdA, thresholdC, customMarginOn ? customMarginVal : null),
    [rows, thresholdA, thresholdC, customMarginOn, customMarginVal],
  );

  const activeMetrics = activeTab === 'categorie' ? categoryMetrics : metrics;

  const { products, totalRevenue, totalProfit, weightedMargin,
    gini, paretoIndex, starRevenuePct, riskRevenuePct, belowAvgCount,
    matrix, paretoData, categories, health, warnings: calcWarnings, marginDegenerate } = activeMetrics;

  const allWarnings = [...parseWarnings, ...calcWarnings];

  const whatIf     = useMemo(() => whatIfSimulate(products, whatIfExcl), [products, whatIfExcl]);
  const whatIfBase = useMemo(() => whatIfSimulate(products, []),         [products]);

  const migration: MigrationSummary | null = useMemo(
    () => compRows ? buildMigration(compRows, products) : null,
    [compRows, products],
  );

  // ── Enriched action items (Lovable format) ────────────────────────────────
  const enrichedActions = useMemo(() => {
    if (!products.length) return [];
    const acProds  = products.filter(p => p.segment === 'AC').sort((a, b) => b.revenue - a.revenue);
    const negProds = products.filter(p => p.marginPct < 0).sort((a, b) => b.revenue - a.revenue);
    const bcProds  = products.filter(p => p.segment === 'BC').sort((a, b) => b.revenue - a.revenue);
    const caProds  = products.filter(p => p.segment === 'CA').sort((a, b) => b.revenue - a.revenue);
    const ccProds  = products.filter(p => p.segment === 'CC').sort((a, b) => b.revenue - a.revenue);

    const acImpact  = acProds.reduce((s, p) => s + Math.max(0, (weightedMargin - p.marginPct) / 100 * p.revenue), 0);
    const negImpact = negProds.reduce((s, p) => s + Math.abs(p.profit), 0);
    const bcImpact  = bcProds.reduce((s, p) => s + Math.max(0, (weightedMargin - p.marginPct) / 100 * p.revenue), 0);
    const caAvgMarg = caProds.length ? caProds.reduce((s, p) => s + p.marginPct, 0) / caProds.length : 0;
    const caImpact  = caProds.reduce((s, p) => s + p.profit * 0.2, 0);
    const ccImpact  = ccProds.reduce((s, p) => s + Math.abs(Math.min(0, p.profit)), 0)
      + ccProds.reduce((s, p) => s + Math.max(0, (weightedMargin * 0.5 - p.marginPct) / 100 * p.revenue), 0) * 0.1;

    const items = [];
    if (acProds.length)  items.push({ n: 1, icon: TrendingUp,   priority: 'alta'  as const, title: 'Rivedere prezzi/costi sui prodotti A-C',                   description: `${acProds.length} prodotti generano alto fatturato ma con margine sotto la media. Portarli al margine medio (${fmtPct(weightedMargin)}) sbloccherebbe profitto significativo.`, impact: acImpact,  products: acProds  });
    if (negProds.length) items.push({ n: 2, icon: AlertTriangle, priority: 'alta'  as const, title: 'Eliminare/ricontrattare prodotti in perdita',               description: `${negProds.length} prodotti hanno margine negativo. Ogni vendita peggiora il bilancio: rivedere prezzo, costi o uscita di catalogo.`,                                           impact: negImpact, products: negProds });
    if (bcProds.length)  items.push({ n: 3, icon: TrendingUp,   priority: 'media' as const, title: 'Ottimizzare prodotti B-C',                                  description: `${bcProds.length} prodotti a fatturato medio con margini bassi: piccoli aggiustamenti di prezzo possono dare ritorni interessanti.`,                                       impact: bcImpact,  products: bcProds  });
    if (caProds.length)  items.push({ n: 4, icon: TrendingUp,   priority: 'media' as const, title: 'Spingere volumi sui prodotti C-A (alto margine, basso fatturato)', description: `${caProds.length} prodotti hanno margini eccellenti (${fmtPct(caAvgMarg)}) ma volumi bassi. Marketing mirato o cross-selling possono moltiplicarne il contributo.`,          impact: caImpact,  products: caProds  });
    if (ccProds.length)  items.push({ n: 5, icon: AlertCircle,  priority: 'bassa' as const, title: 'Valutare razionalizzazione catalogo C-C',                   description: `${ccProds.length} prodotti (${fmtPct(matrix.CC.revenuePct)} del catalogo) sono in C-C: bassa rilevanza commerciale. Verificare se mantenere, rilanciare o uscire.`,            impact: Math.max(0, ccImpact),  products: ccProds  });
    return items;
  }, [products, weightedMargin, matrix]);

  const totalImpact = enrichedActions.reduce((s, a) => s + a.impact, 0);

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const result: { type: 'critical' | 'warning' | 'opportunity'; product: ClassifiedRow; message: string }[] = [];
    for (const p of products) {
      // Anti-false-positive: skip alerts on degenerate data (weightedMargin=0)
      if (marginDegenerate) continue;

      if (p.ratingRevenue === 'A' && p.marginPct < weightedMargin && Math.abs(weightedMargin) >= 0.01) {
        result.push({ type: 'critical',    product: p, message: `Alto fatturato ma margine ${fmtPct(p.marginPct)} (sotto media ${fmtPct(weightedMargin)})` });
      } else if (p.marginPct < 0) {
        result.push({ type: 'critical',    product: p, message: `Margine negativo (${fmtPct(p.marginPct)}) — perdita su ogni vendita` });
      } else if (p.ratingRevenue === 'B' && p.marginPct < weightedMargin * 0.5 && p.marginPct >= 0) {
        result.push({ type: 'warning',     product: p, message: `Fatturato medio con margine critico ${fmtPct(p.marginPct)}` });
      } else if (p.ratingMargin === 'A' && p.ratingRevenue === 'C' && Math.abs(p.marginPct) >= 0.01) {
        // Anti-false-positive: only emit "opportunity" if margin is genuinely non-zero
        result.push({ type: 'opportunity', product: p, message: `Alto margine (${fmtPct(p.marginPct)}) con volume basso — potenziale inespresso` });
      }
    }
    return result.sort((a, b) => {
      const ord = { critical: 0, warning: 1, opportunity: 2 };
      return ord[a.type] !== ord[b.type] ? ord[a.type] - ord[b.type] : b.product.revenue - a.product.revenue;
    });
  }, [products, weightedMargin, marginDegenerate]);

  const alertsFiltered = useMemo(() => {
    if (alertFilter === 'all')          return alerts;
    if (alertFilter === 'critical')     return alerts.filter(a => a.type === 'critical');
    if (alertFilter === 'warning')      return alerts.filter(a => a.type === 'warning');
    return alerts.filter(a => a.type === 'opportunity');
  }, [alerts, alertFilter]);

  // ── Treemap data ──────────────────────────────────────────────────────────
  const treemapRects = useMemo(() => {
    const items = MATRIX_ORDER.filter(k => matrix[k].revenue > 0)
      .map(k => ({ key: k, revenue: matrix[k].revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    const tot = items.reduce((s, i) => s + i.revenue, 0);
    if (!tot) return [];
    return squarify(items, 0, 0, 640, 300, tot);
  }, [matrix]);

  // ── Quadrant data (categories) ────────────────────────────────────────────
  const avgCatRevenue = categories.length ? categories.reduce((s, c) => s + c.revenue, 0) / categories.length : 0;
  const catMax = categories.length ? Math.max(...categories.map(c => c.count)) : 1;

  // ── Category Top/Bottom ───────────────────────────────────────────────────
  const catSorted = [...categories].sort((a, b) => catSort === 'fatturato' ? b.revenue - a.revenue : b.marginPct - a.marginPct);
  const topCats   = catSorted.slice(0, 5);
  const btmCats   = [...catSorted].reverse().slice(0, 5);
  const shownCats = catDir === 'top' ? topCats : btmCats;

  // ── Heatmap per articolo ──────────────────────────────────────────────────
  const heatmapCategories = useMemo(() => {
    const map = new Map<string, ClassifiedRow[]>();
    for (const p of products) {
      const cat = p.category || '(N/D)';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    const result = [...map.entries()]
      .map(([cat, prods]) => ({
        cat,
        prods: prods.sort((a, b) => b.revenue - a.revenue),
        totalRevenue: prods.reduce((s, p) => s + p.revenue, 0),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    return result;
  }, [products]);

  const heatmapFiltered = useMemo(() => {
    let base = heatmapCategories;
    if (heatmapFilter) base = base.map(c => ({ ...c, prods: c.prods.filter(p => p.segment === heatmapFilter) })).filter(c => c.prods.length > 0);
    if (heatSearch.trim()) {
      const q = heatSearch.trim().toLowerCase();
      base = base.filter(c =>
        c.cat.toLowerCase().includes(q) ||
        c.prods.some(p => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)),
      );
    }
    return base;
  }, [heatmapCategories, heatmapFilter, heatSearch]);

  // ── Heatmap categoria × segmento ─────────────────────────────────────────
  const catHeatmap = useMemo(() => {
    const top20 = [...categories].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    return top20.map(cat => {
      const catProds = products.filter(p => (p.category || '(N/D)') === cat.category);
      const catRev   = catProds.reduce((s, p) => s + p.revenue, 0);
      const cells = Object.fromEntries(
        MATRIX_ORDER.map(k => {
          const kProds = catProds.filter(p => p.segment === k);
          const kRev   = kProds.reduce((s, p) => s + p.revenue, 0);
          return [k, catRev > 0 ? kRev / catRev * 100 : 0];
        }),
      ) as Record<SegmentKey, number>;
      return { category: cat.category, revenue: cat.revenue, cells };
    });
  }, [categories, products]);

  // ── File handlers ─────────────────────────────────────────────────────────
  async function handleMainFile(file: File) {
    setLoadingFile(true);
    try {
      const rawRows = await readExcel(file);
      const result  = parseGenericRows(rawRows);
      setRows(result.rows);
      setParseWarnings(result.warnings);
      setSelectedCell(null);
      if (result.warnings.length > 0) {
        console.warn('[ABC] Parse warnings:', result.warnings);
      }
    } catch { alert('Errore lettura file. Assicurati che sia un Excel valido.'); }
    finally { setLoadingFile(false); }
  }

  async function handleCompFile(file: File) {
    try {
      const rawRows  = await readExcel(file);
      const result   = parseGenericRows(rawRows);
      const calcComp = calculate(result.rows, thresholdA, thresholdC, customMarginOn ? customMarginVal : null);
      setCompRows(calcComp.products);
    } catch { alert('Errore lettura file di confronto.'); }
  }

  function handleExport() {
    const data = products.map(p => ({
      Codice: p.id, Descrizione: p.name, Categoria: p.category,
      Fatturato: p.revenue, Costo: p.cost, Profitto: p.profit,
      'Margine%': +p.marginPct.toFixed(2), 'Cum.Rev%': +p.cumRevenuePct.toFixed(2),
      'Rating Fatt.': p.ratingRevenue, 'Rating Marg.': p.ratingMargin,
      Segmento: p.segment, 'Nome Segmento': SEGMENTS[p.segment].label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ABC Matrix');
    XLSX.writeFile(wb, 'abc-matrix.xlsx');
  }

  // ── Upload screen ─────────────────────────────────────────────────────────
  if (!rows) {
    return (
      <div className="min-h-full flex flex-col bg-slate-50">
        <div className="px-8 pt-8 pb-2 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ChartColumn className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Matrice ABC</h1>
            <p className="text-xs text-slate-500">Analisi Fatturato × Margine</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div
            className={`w-full max-w-[600px] border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-colors bg-white ${uploadDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
            onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
            onDragLeave={() => setUploadDragging(false)}
            onDrop={e => { e.preventDefault(); setUploadDragging(false); const f = e.dataTransfer.files[0]; if (f) handleMainFile(f); }}
            onClick={() => uploadInputRef.current?.click()}
          >
            {loadingFile ? <Loader2 className="w-10 h-10 mx-auto text-blue-500 mb-5 animate-spin" /> : <Upload className="w-10 h-10 mx-auto text-slate-400 mb-5" />}
            <h2 className="text-base font-bold text-slate-800 mb-2">{loadingFile ? 'Caricamento in corso…' : 'Carica il file Excel'}</h2>
            {!loadingFile && (
              <>
                <p className="text-sm text-slate-500">4 colonne: Articolo, Fatturato, Categoria, Margine (%)</p>
                <p className="text-sm text-slate-500 mt-1.5">+ colonne opzionali (rilevate da intestazione): <strong className="text-slate-700">Brand / Marca</strong>, <strong className="text-slate-700">Rotazione</strong> magazzino</p>
                <p className="text-sm text-slate-400 mt-4">Trascina qui o clicca per selezionare (.xlsx, .xls, .csv)</p>
              </>
            )}
            <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleMainFile(f); e.target.value = ''; }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ChartColumn className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Matrice ABC</h1>
            <p className="text-xs text-slate-500">Analisi Fatturato × Margine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" /> Carica nuovo file
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              ref={mainInputRef}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleMainFile(f); e.target.value = ''; }} />
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Esporta Excel
          </button>
          <button
            onClick={() => { setRows(null); setCompRows(null); setSelectedCell(null); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {(['prodotti', 'categorie'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'prodotti' ? <Package className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Warnings banner ───────────────────────────────────────────────── */}
      {allWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Avvisi parsing / dati
          </p>
          {allWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">{w}</p>
          ))}
        </div>
      )}

      {/* ── KPI 4 large ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Package,     label: activeTab === 'categorie' ? 'CATEGORIE' : 'PRODOTTI', value: products.length.toString(), sub: activeTab === 'categorie' ? `${metrics.categories.length} categorie totali` : `${categories.length} categorie` },
          { icon: TrendingUp,  label: 'FATTURATO TOTALE', value: fmtK(totalRevenue),                                           sub: `Costo: ${fmtK(totalRevenue - totalProfit)}` },
          { icon: ChartColumn, label: 'MARGINE MEDIO',    value: products.length ? fmtPct(weightedMargin) : 'N/A',             sub: `Profitto: ${fmtK(totalProfit)}` },
          { icon: Target,      label: 'STAR (A/A)',       value: `${matrix.AA.count} / ${products.filter(p => p.ratingRevenue === 'A').length} classe A`, sub: `${fmtPct(starRevenuePct)} del fatturato` },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <Icon className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── KPI 6 secondary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Activity,      label: 'CONCENTRAZIONE (GINI)', value: gini.toFixed(2),           sub: gini < 0.3 ? 'Distribuita' : gini < 0.6 ? 'Media' : 'Molto concentrata', color: gini > 0.6 ? 'text-red-500' : 'text-emerald-600' },
          { icon: Percent,       label: 'MARGINE MEDIO PESATO',  value: fmtPct(weightedMargin),    sub: `Profitto: ${fmtK(totalProfit)}`,                                         color: 'text-slate-800' },
          { icon: TrendingUp,    label: 'INDICE PARETO',         value: fmtPct(paretoIndex),       sub: "Prodotti che fanno l'80%",                                               color: 'text-blue-600' },
          { icon: Star,          label: 'FATTURATO STAR',        value: fmtPct(starRevenuePct),    sub: 'Cella A-A',                                                              color: 'text-emerald-600' },
          { icon: TriangleAlert, label: 'FATTURATO A RISCHIO',   value: fmtPct(riskRevenuePct),    sub: 'Margine basso (AC/BC/CC)',                                                color: riskRevenuePct > 20 ? 'text-red-500' : 'text-slate-700' },
          { icon: Users,         label: 'PRODOTTI SOTTO MEDIA',  value: belowAvgCount.toString(),  sub: `su ${products.length} totali`,                                           color: 'text-slate-600' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Confronto tra periodi (prodotti only) ────────────────────────── */}
      {activeTab !== 'categorie' && !migration ? (
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-slate-300 transition-colors bg-white"
          onClick={() => document.getElementById('comp-file-input')?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCompFile(f); }}
        >
          <Upload className="w-7 h-7 mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-semibold text-slate-700 mb-1">Confronto tra periodi</p>
          <p className="text-xs text-slate-400">Carica un secondo file (es. anno precedente) per vedere la migration matrix e i prodotti che sono cresciuti o peggiorati</p>
          <input id="comp-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCompFile(f); e.target.value = ''; }} />
        </div>
      ) : activeTab !== 'categorie' && migration ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <GitCompare className="w-4 h-4" /> Confronto tra Periodi
            </h3>
            <button onClick={() => setCompRows(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ rimuovi</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Δ Fatturato',    value: fmtK(migration.deltaRevenue), delta: migration.deltaRevenue },
              { label: 'Δ Profitto',     value: fmtK(migration.deltaProfit),  delta: migration.deltaProfit  },
              { label: 'Δ Margine',      value: `${migration.deltaMargin >= 0 ? '+' : ''}${migration.deltaMargin.toFixed(1)}pp`, delta: migration.deltaMargin },
              { label: 'Nuovi prodotti', value: `+${migration.newItems}`, delta: migration.newItems },
              { label: 'Usciti',         value: `-${migration.dropped}`,  delta: -migration.dropped  },
            ].map(({ label, value, delta }) => (
              <div key={label} className="border rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                <p className={`text-base font-bold tabular-nums mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp,  label: 'Migliorati',  value: migration.improved,  color: 'text-emerald-600' },
              { icon: Activity,    label: 'Stabili',     value: migration.stable,    color: 'text-amber-500'   },
              { icon: ChevronDown, label: 'Peggiorati',  value: migration.worsened,  color: 'text-red-500'     },
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
      ) : null}

      {/* ── Matrix + Settings ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">

        {/* 3×3 matrix */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-5">
            Matrice ABC — Fatturato × Margine
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="flex items-end pb-1"><span className="text-xs text-slate-400">Fatt. ↓ / Marg. →</span></div>
            {['Margine A', 'Margine B', 'Margine C'].map(h => (
              <div key={h} className="text-center pb-1"><span className="text-sm font-bold text-slate-700">{h}</span></div>
            ))}
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
                      className={`rounded-xl border p-4 transition-all hover:scale-[1.02] hover:shadow-md text-center ${s.bg} ${s.border} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
                      <div className={`text-xs font-semibold mb-1 ${s.text}`}>
                        {SEGMENTS[key].label} {SEGMENTS[key].emoji}
                      </div>
                      <div className={`text-3xl font-bold tabular-nums mt-1 ${s.text}`}>{cell.count}</div>
                      <div className="text-xs mt-2 text-slate-500">
                        {fmtPct(cell.revenuePct)} · {fmtK(cell.revenue)}
                      </div>
                    </button>
                  );
                })}
              </>
            ))}
          </div>
          {selectedCell && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Prodotti {selectedCell} — {SEGMENTS[selectedCell].label} ({matrix[selectedCell].count})
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {products.filter(p => p.segment === selectedCell).map(p => (
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
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Impostazioni Margine</h3>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Riferimento media</label>
            <select
              value={customMarginOn ? 'custom' : 'auto'}
              onChange={e => setCustomMarginOn(e.target.value === 'custom')}
              className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-400"
            >
              <option value="auto">Media Azienda</option>
              <option value="custom">Personalizzato</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Margine medio personalizzato</label>
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
              <label className="text-xs font-medium text-slate-600">Soglia A (% relativa, es. 10)</label>
              <input type="number" value={thresholdA} onChange={e => setThresholdA(+e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Soglia C (% relativa, es. 10)</label>
              <input type="number" value={thresholdC} onChange={e => setThresholdC(+e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Media pesata dai dati · A ≥ media×{(1 + thresholdA / 100).toFixed(2)} · C &lt; media×{(1 - thresholdC / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* ── Pareto + Top/Bottom ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Curva di Pareto</h3>
            <span className="text-xs text-slate-500"><span className="font-semibold text-slate-800">{fmtPct(paretoIndex)}</span> dei prodotti = 80% del fatturato</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">Clicca un punto per vedere i prodotti fino a quella soglia</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={paretoData} margin={{ top: 5, right: 10, bottom: 20, left: 5 }}>
              <defs>
                <linearGradient id="paretoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="productPct" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} />
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 3" label={{ value: '80%', position: 'right', fontSize: 10, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="revenuePct" stroke="#10b981" fill="url(#paretoGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Top / Bottom Categorie</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{categories.length} categorie totali</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
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
              <XAxis type="number" tickFormatter={catSort === 'fatturato' ? v => fmtK(v) : v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => catSort === 'fatturato' ? [fmtEur.format(Number(v))] : [`${Number(v).toFixed(1)}%`]} contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} />
              <Bar dataKey={catSort === 'fatturato' ? 'revenue' : 'marginPct'} radius={[0, 4, 4, 0]} maxBarSize={24}>
                {shownCats.map((_, i) => <Cell key={i} fill={catDir === 'top' ? '#3b82f6' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Health Score + Action Items ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Health Score</h3>
          </div>
          <div className="text-center space-y-1">
            <div className={`text-6xl font-bold tabular-nums ${health.total >= 70 ? 'text-emerald-600' : health.total >= 45 ? 'text-amber-500' : 'text-red-500'}`}>{health.total}</div>
            <div className="text-sm text-slate-500">su 100</div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-2 ${health.total >= 80 ? 'border-emerald-300 text-emerald-700' : health.total >= 65 ? 'border-amber-300 text-amber-700' : 'border-red-300 text-red-700'}`}>
              {health.total >= 80 ? 'A — Eccellente' : health.total >= 65 ? 'B — Buono' : health.total >= 45 ? 'C — Da migliorare' : 'D — Critico'}
            </span>
          </div>
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {[
              { label: 'Diversificazione',    score: health.diversification, desc: `Gini ${gini.toFixed(2)} — ${gini < 0.3 ? 'distribuzione equilibrata' : gini < 0.6 ? 'concentrazione media' : 'troppa concentrazione'}` },
              { label: 'Prodotti Star',        score: health.starScore,       desc: `${fmtPct(starRevenuePct)} fatturato in A-A` },
              { label: 'Esposizione Rischio',  score: health.riskScore,       desc: `${fmtPct(riskRevenuePct)} fatturato a basso margine` },
              { label: 'Profittabilità',       score: health.profitability,   desc: `Margine medio ${fmtPct(weightedMargin)}` },
              { label: 'Resilienza',           score: health.resilience,      desc: `${fmtPct(paretoIndex)} prodotti fanno l'80%` },
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

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wider">Action Items</h3>
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5">{enrichedActions.length}</span>
            </div>
            {totalImpact > 0 && (
              <span className="text-xs text-slate-500">Impatto potenziale totale: <strong className="text-slate-800">{fmtImpact(totalImpact)}</strong></span>
            )}
          </div>
          {enrichedActions.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />Nessuna azione critica. Portafoglio bilanciato!
            </div>
          ) : (
            <div className="space-y-3">
              {enrichedActions.map((a, i) => {
                const Icon = a.icon;
                const priColor = a.priority === 'alta' ? 'bg-red-50 text-red-600 border-red-200' : a.priority === 'media' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200';
                const shown = a.products.slice(0, 5);
                const rest  = a.products.length - shown.length;
                return (
                  <div key={i} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{a.n}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{a.description}</p>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priColor}`}>
                        {a.priority.charAt(0).toUpperCase() + a.priority.slice(1)} priorità
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 mb-3">
                      <span>Impatto stimato: <strong className="text-slate-800">{fmtImpact(a.impact)}</strong></span>
                      <span>Prodotti: <strong className="text-slate-800">{a.products.length}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {shown.map(p => (
                        <span key={p.id} className="inline-flex items-center px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-600 font-medium">
                          {p.id} — {p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name}
                        </span>
                      ))}
                      {rest > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-500">+{rest}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── What-if ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">What-if: simulatore di razionalizzazione</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Seleziona i segmenti da eliminare per stimare l'impatto</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {MATRIX_ORDER.map(key => {
            const cell    = matrix[key];
            const sel     = whatIfExcl.includes(key);
            const s       = SEG_STYLE[key];
            return (
              <button key={key}
                onClick={() => setWhatIfExcl(prev => sel ? prev.filter(k => k !== key) : [...prev, key])}
                disabled={cell.count === 0}
                className={`border rounded-xl p-4 text-left transition-all ${
                  cell.count === 0 ? 'opacity-30 cursor-not-allowed border-slate-100' :
                  sel ? 'border-red-400 bg-red-50 ring-1 ring-red-300' : `${s.bg} ${s.border} hover:shadow-sm`
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">{SEGMENTS[key].label} {SEGMENTS[key].emoji}</span>
                  <span className="text-lg font-bold tabular-nums text-slate-800">{cell.count}</span>
                </div>
                <p className="text-xs text-slate-500">{fmtK(cell.revenue)}</p>
                {sel && <p className="text-[10px] text-red-500 font-semibold mt-1">✕ ESCLUSO</p>}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          {[
            { label: 'FATTURATO',     curr: whatIf.revenue,   base: whatIfBase.revenue,   fmt: fmtK },
            { label: 'PROFITTO',      curr: whatIf.profit,    base: whatIfBase.profit,    fmt: fmtK },
            { label: 'MARGINE MEDIO', curr: whatIf.marginPct, base: whatIfBase.marginPct, fmt: fmtPct },
          ].map(({ label, curr, base, fmt }) => {
            const delta    = base > 0 ? (curr - base) / base * 100 : 0;
            const deltaAbs = curr - base;
            return (
              <div key={label} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">{fmt(curr)}</p>
                <p className="text-[10px] text-slate-400 tabular-nums">era {fmt(base)}</p>
                <p className={`text-xs font-semibold tabular-nums mt-1 ${deltaAbs < 0 ? 'text-red-500' : 'text-slate-500'}`}>{fmtDiff(delta)}</p>
                <p className="text-[10px] tabular-nums mt-0.5 text-slate-400">{deltaAbs >= 0 ? '+' : ''}{label === 'MARGINE MEDIO' ? `${deltaAbs.toFixed(1)}pp` : fmtK(deltaAbs)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Treemap + Scatter ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500 mb-4">Treemap Fatturato per Cella</h3>
          <div className="relative w-full" style={{ height: 300 }}>
            <svg viewBox="0 0 640 300" className="w-full h-full">
              {treemapRects.map(r => (
                <g key={r.key}>
                  <rect x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} rx={6} fill={TREEMAP_COLORS[r.key]} />
                  {r.w > 70 && r.h > 40 && (
                    <>
                      <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 8} textAnchor="middle" fontSize={Math.min(13, r.w / 8)} fill="white" fontWeight="700" className="pointer-events-none">
                        {SEGMENTS[r.key].label} {SEGMENTS[r.key].emoji}
                      </text>
                      <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 10} textAnchor="middle" fontSize={Math.min(11, r.w / 9)} fill="rgba(255,255,255,0.9)" className="pointer-events-none">
                        {fmtK(r.revenue)}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500 mb-4">Scatter — Fatturato vs Margine</h3>
          <ScatterMatrix products={products} />
        </div>
      </div>

      {/* ── Heatmap Categoria × Cella ABC ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">Heatmap Categoria × Cella ABC</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">% del fatturato di ogni categoria che cade in ciascuna cella · top 20 categorie</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Sano</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Medio</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> A rischio</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Categoria</th>
                {MATRIX_ORDER.map(k => (
                  <th key={k} className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    <div>{k.charAt(0)}-{k.charAt(1)}</div>
                    <div className="font-normal normal-case text-slate-300">{SEGMENTS[k].label}</div>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wide">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {catHeatmap.map(row => (
                <tr key={row.category} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-slate-700 font-medium max-w-[180px] truncate">{row.category}</td>
                  {MATRIX_ORDER.map(k => {
                    const v = row.cells[k];
                    const bg = v === 0 ? '' : ['AA', 'BA', 'CA'].includes(k) ? `rgba(16,185,129,${Math.min(1, v / 60)})` : ['AC', 'BC', 'CC'].includes(k) ? `rgba(239,68,68,${Math.min(1, v / 60)})` : `rgba(245,158,11,${Math.min(1, v / 60)})`;
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        {v > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ background: bg, color: v > 30 ? 'white' : '#374151' }}>
                            {v.toFixed(0)}%
                          </span>
                        ) : <span className="text-slate-200">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{fmtK(row.revenue)}</td>
                </tr>
              ))}
              {catHeatmap.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Nessun dato</td></tr>
              )}
            </tbody>
          </table>
          {categories.length > 20 && (
            <p className="px-4 py-2 text-[11px] text-slate-400 text-center">+{categories.length - 20} categorie non mostrate</p>
          )}
        </div>
      </div>

      {/* ── Heatmap per Codice Articolo (prodotti only) ───────────────────── */}
      {activeTab !== 'categorie' && <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">Heatmap per Codice Articolo</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Filtra per cella ABC e ispeziona i singoli articoli raggruppati per categoria.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setExpandedCats(new Set(heatmapFiltered.map(c => c.cat)))} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded">Espandi tutto</button>
            <button onClick={() => setExpandedCats(new Set())} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded">Comprimi</button>
          </div>
        </div>

        {/* Filter grid */}
        <div className="grid grid-cols-3 gap-2">
          {MATRIX_ORDER.map(key => {
            const cell = matrix[key];
            const s = SEG_STYLE[key];
            const active = heatmapFilter === key;
            return (
              <button key={key}
                onClick={() => setHeatmapFilter(active ? null : key)}
                disabled={cell.count === 0}
                className={`border rounded-xl p-3 text-left transition-all ${
                  cell.count === 0 ? 'opacity-30 cursor-not-allowed border-slate-100' :
                  active ? 'border-blue-400 ring-2 ring-blue-200' : `${s.bg} ${s.border} hover:shadow-sm`
                }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <SegmentBadge seg={key} />
                  <span className="text-xs font-semibold text-slate-700 ml-auto tabular-nums">{cell.count}</span>
                </div>
                <p className="text-xs font-medium text-slate-700">{SEGMENTS[key].label}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">{fmtK(cell.revenue)}</p>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cerca articolo o categoria…"
            value={heatSearch}
            onChange={e => setHeatSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-slate-50"
          />
        </div>

        {/* Category list */}
        <div className="space-y-1.5">
          {heatmapFiltered.map(({ cat, prods, totalRevenue: catTotalRev }) => {
            const isOpen = expandedCats.has(cat);

            return (
              <div key={cat} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    const next = new Set(expandedCats);
                    if (isOpen) next.delete(cat); else next.add(cat);
                    setExpandedCats(next);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                    <span className="text-sm font-medium text-slate-700">{cat}</span>
                    <span className="text-xs text-slate-400">({prods.length})</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-600 tabular-nums">{fmtK(catTotalRev)}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 pt-3">
                      {prods.map(p => <ProductCard key={p.id} p={p} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {heatmapFiltered.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">Nessun risultato</div>
          )}
        </div>
      </div>}

      {/* ── Quadrante Strategico + Alert Automatici ────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Quadrante strategico categorie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500 mb-1">Quadrante Strategico Categorie</h3>
          <p className="text-[11px] text-slate-400 mb-3">Bolla = n° prodotti · linee tratteggiate = medie aziendali</p>
          <div className="flex flex-wrap gap-3 mb-3 text-[11px]">
            {[
              { color: 'bg-emerald-500', label: `Star (${categories.filter(c => c.revenue >= avgCatRevenue && c.marginPct >= weightedMargin).length})` },
              { color: 'bg-amber-400',   label: `Cash Cow (${categories.filter(c => c.revenue >= avgCatRevenue && c.marginPct < weightedMargin).length})` },
              { color: 'bg-blue-400',    label: `Nicchia (${categories.filter(c => c.revenue < avgCatRevenue && c.marginPct >= weightedMargin).length})` },
              { color: 'bg-red-400',     label: `A rischio (${categories.filter(c => c.revenue < avgCatRevenue && c.marginPct < weightedMargin).length})` },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />{label}
              </span>
            ))}
          </div>
          {categories.length > 0 ? (() => {
            const W = 400, H = 280, PAD = { t: 20, r: 20, b: 50, l: 64 };
            const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
            const xs = categories.map(c => c.revenue);
            const ys = categories.map(c => c.marginPct);
            const x1 = Math.max(...xs) * 1.1 || 1;
            const yMin = Math.min(...ys), yMax = Math.max(...ys);
            const yRange = yMax - yMin || 1;
            const y0 = yMin - yRange * 0.15, y1 = yMax + yRange * 0.15;
            const sx = (v: number) => PAD.l + (v / x1) * pw;
            const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * ph;
            const refY = sy(weightedMargin);
            const refX = sx(avgCatRevenue);
            return (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
                <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e2e8f0" />
                <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e2e8f0" />
                <line x1={refX} y1={PAD.t} x2={refX} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1} />
                <line x1={PAD.l} y1={refY} x2={W - PAD.r} y2={refY} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1} />
                <text x={refX + 3} y={PAD.t + 10} fontSize={8} fill="#94a3b8">media {fmtK(avgCatRevenue)}</text>
                <text x={PAD.l + 3} y={refY - 4} fontSize={8} fill="#94a3b8">media {fmtPct(weightedMargin)}</text>
                {categories.map((c, i) => {
                  const isStar   = c.revenue >= avgCatRevenue && c.marginPct >= weightedMargin;
                  const isCash   = c.revenue >= avgCatRevenue && c.marginPct < weightedMargin;
                  const isNiche  = c.revenue < avgCatRevenue  && c.marginPct >= weightedMargin;
                  const color    = isStar ? '#10b981' : isCash ? '#f59e0b' : isNiche ? '#60a5fa' : '#f87171';
                  const r        = 4 + (c.count / catMax) * 18;
                  return (
                    <circle key={i} cx={sx(c.revenue)} cy={sy(c.marginPct)} r={r}
                      fill={color} fillOpacity={0.75} stroke="white" strokeWidth={1} />
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map(t => (
                  <text key={t} x={sx(x1 * t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={8} fill="#94a3b8">{fmtK(x1 * t)}</text>
                ))}
                {[y0, (y0 + y1) / 2, y1].map((t, i) => (
                  <text key={i} x={PAD.l - 4} y={sy(t) + 4} textAnchor="end" fontSize={8} fill="#94a3b8">{t.toFixed(0)}%</text>
                ))}
                <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">Fatturato →</text>
                <text x={12} y={H / 2} textAnchor="middle" fontSize={9} fill="#94a3b8" transform={`rotate(-90 12 ${H / 2})`}>Margine medio (%) →</text>
              </svg>
            );
          })() : <div className="h-48 flex items-center justify-center text-sm text-slate-400">Nessun dato</div>}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { color: 'border-l-emerald-500', label: 'Star',      desc: 'Alto fatturato + alto margine' },
              { color: 'border-l-amber-400',   label: 'Cash Cow',  desc: 'Alto fatturato, margine sotto media' },
              { color: 'border-l-blue-400',    label: 'Nicchia',   desc: 'Basso fatturato + alto margine' },
              { color: 'border-l-red-400',     label: 'A rischio', desc: 'Basso fatturato + basso margine' },
            ].map(({ color, label, desc }) => (
              <div key={label} className={`border-l-4 pl-2 ${color}`}>
                <p className="text-[11px] font-semibold text-slate-700">{label}</p>
                <p className="text-[10px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alert Automatici */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">Alert Automatici & Outlier</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Filtra per severità · clicca un alert per filtrare la tabella prodotti</p>
            </div>
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {([
              { key: 'all'         as const, label: `Tutti (${alerts.length})` },
              { key: 'critical'    as const, label: `Critici (${alerts.filter(a => a.type === 'critical').length})` },
              { key: 'warning'     as const, label: `Attenzione (${alerts.filter(a => a.type === 'warning').length})` },
              { key: 'opportunity' as const, label: `Opportunità (${alerts.filter(a => a.type === 'opportunity').length})` },
            ]).map(btn => (
              <button key={btn.key} onClick={() => setAlertFilter(btn.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${alertFilter === btn.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {btn.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {alertsFiltered.slice(0, 50).map((a, i) => {
              const borderColor = a.type === 'critical' ? 'border-l-red-500' : a.type === 'warning' ? 'border-l-amber-400' : 'border-l-emerald-500';
              const Icon = a.type === 'critical' ? TriangleAlert : a.type === 'warning' ? AlertTriangle : TrendingUp;
              const iconColor = a.type === 'critical' ? 'text-red-500' : a.type === 'warning' ? 'text-amber-500' : 'text-emerald-500';
              const typeLabel = a.type === 'critical' ? 'Critico' : a.type === 'warning' ? 'Attenzione' : 'Opportunità';
              const typeLabelColor = a.type === 'critical' ? 'text-red-500' : a.type === 'warning' ? 'text-amber-500' : 'text-emerald-600';
              return (
                <div key={i} className={`border-l-4 ${borderColor} border border-slate-100 rounded-r-lg px-3 py-2.5`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{a.product.id} — {a.product.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{a.message}</p>
                        <p className={`text-[10px] font-semibold mt-1 ${typeLabelColor} uppercase tracking-wide`}>
                          {typeLabel} · {a.product.category || '—'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0">{fmtEur.format(a.product.revenue)}</span>
                  </div>
                </div>
              );
            })}
            {alertsFiltered.length > 50 && (
              <p className="text-center text-xs text-slate-400 py-2">+{alertsFiltered.length - 50} altri alert non mostrati</p>
            )}
            {alertsFiltered.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">Nessun alert in questa categoria</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Dettaglio Prodotti & Consigli Strategici ──────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Dettaglio Prodotti & Consigli Strategici</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {MATRIX_ORDER.map(key => {
            const cell    = matrix[key];
            const s       = SEG_STYLE[key];
            const Icon    = SEGMENT_ICONS[key];
            const isOpen  = expandedSegments.has(key);
            const segProds = products.filter(p => p.segment === key).sort((a, b) => b.revenue - a.revenue);
            if (cell.count === 0) return null;
            return (
              <div key={key} className={`border-l-4 ${s.leftBorder}`}>
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    const next = new Set(expandedSegments);
                    if (isOpen) next.delete(key); else next.add(key);
                    setExpandedSegments(next);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${s.text}`} />
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${s.text}`}>{SEGMENTS[key].label} {SEGMENTS[key].emoji}</p>
                      <p className="text-xs text-slate-400">Fatt. {key.charAt(0)} / Marg. {key.charAt(1)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">{cell.count} prodotti</span>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{fmtK(cell.revenue)}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {segProds.map(p => <ProductCard key={p.id} p={p} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
