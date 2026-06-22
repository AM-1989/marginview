import { useState, useMemo, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, Building2, MessageSquareText, PenLine,
  FileDown, Plus, Trash2, Activity, RotateCcw,
} from 'lucide-react';
import { exportPDF } from '../lib/exportPDF';
import { calculateBalanceKPIs } from '../lib/balanceAnalysis';
import type { BalanceInputYear, BalanceKPI } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'input' | 'glossario';
type EditableField = keyof Omit<BalanceInputYear, 'anno'>;

// ── Defaults ──────────────────────────────────────────────────────────────────

const CY = new Date().getFullYear();

const BLANK_YEAR = (anno: number): BalanceInputYear => ({
  anno,
  ricavi: 0, costoDelVenduto: 0, costiOperativi: 0, ammortamenti: 0,
  oneriFinanziari: 0, imposte: 0,
  creditiClienti: 0, magazzino: 0, debitiFornitori: 0, liquidita: 0,
  debitiFinanziariBT: 0, debitiFinanziariLT: 0, patrimoniNetto: 0,
  totaleAttivo: 0, attivoCorriente: 0, passivoCorriente: 0,
  capex: 0,
});

const DEFAULT_YEARS = [CY - 3, CY - 2, CY - 1, CY].map(BLANK_YEAR);

// ── Input grid row definitions ────────────────────────────────────────────────

interface RowDef { field: EditableField; label: string; section?: string }

const ROW_DEFS: RowDef[] = [
  // Conto Economico
  { field: 'ricavi',            label: 'Ricavi',                      section: 'Conto Economico' },
  { field: 'costoDelVenduto',   label: 'Costo del venduto' },
  { field: 'costiOperativi',    label: 'Costi operativi (OPEX)' },
  { field: 'ammortamenti',      label: 'Ammortamenti' },
  { field: 'oneriFinanziari',   label: 'Oneri finanziari' },
  { field: 'imposte',           label: 'Imposte' },
  // Stato Patrimoniale
  { field: 'creditiClienti',    label: 'Crediti commerciali',         section: 'Stato Patrimoniale' },
  { field: 'magazzino',         label: 'Magazzino' },
  { field: 'debitiFornitori',   label: 'Debiti commerciali' },
  { field: 'liquidita',         label: 'Liquidità' },
  { field: 'debitiFinanziariBT', label: 'Debiti finanziari BT' },
  { field: 'debitiFinanziariLT', label: 'Debiti finanziari LT' },
  { field: 'patrimoniNetto',    label: 'Patrimonio netto' },
  { field: 'totaleAttivo',      label: 'Totale attivo' },
  { field: 'attivoCorriente',   label: 'Attivo corrente' },
  { field: 'passivoCorriente',  label: 'Passivo corrente' },
  // Cash Flow
  { field: 'capex',             label: 'Investimenti (CAPEX)',        section: 'Cash Flow' },
];

// ── Rating / badge ─────────────────────────────────────────────────────────────

type Quality = 'good' | 'warn' | 'bad' | 'neutral';

interface Thr { good: (v: number) => boolean; warn: (v: number) => boolean; inv?: boolean }

const THR: Record<string, Thr> = {
  ebitdaPerc:  { good: v => v >= 15,  warn: v => v >= 5   },
  roe:         { good: v => v >= 15,  warn: v => v >= 5   },
  roi:         { good: v => v >= 10,  warn: v => v >= 5   },
  currentRatio:{ good: v => v >= 1.5, warn: v => v >= 1.0 },
  quickRatio:  { good: v => v >= 1.0, warn: v => v >= 0.7 },
  pfnEbitda:   { good: v => v <= 2.0, warn: v => v <= 4.0, inv: true },
};

function rate(key: string, v: number): Quality {
  const t = THR[key];
  if (!t) return 'neutral';
  return t.good(v) ? 'good' : t.warn(v) ? 'warn' : 'bad';
}

const BADGE_CLS: Record<Quality, string> = {
  good:    'bg-emerald-50 border-emerald-200 text-emerald-700',
  warn:    'bg-amber-50   border-amber-200   text-amber-700',
  bad:     'bg-red-50     border-red-200     text-red-700',
  neutral: 'bg-slate-50   border-slate-200   text-slate-500',
};
const BADGE_LABEL: Record<Quality, string> = {
  good: 'Ottimo', warn: 'Attenzione', bad: 'Critico', neutral: '',
};

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtEur  = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct  = (v: number) => `${v.toFixed(1)}%`;
const fmtX    = (v: number) => `${v.toFixed(2)}×`;
const fmtGg   = (v: number) => `${Math.round(v)} gg`;
const fmtEurK = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}€ ${(abs / 1_000_000).toFixed(1)}M`;
  return `${v < 0 ? '-' : ''}€ ${(abs / 1_000).toFixed(0)}k`;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, qKey, neutral = false,
}: {
  label: string; value: string; sub?: string; qKey?: string; neutral?: boolean;
}) {
  const q: Quality = qKey ? rate(qKey, parseFloat(value)) : 'neutral';
  const showBadge = qKey && !neutral;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-1.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {showBadge && q !== 'neutral' && (
        <span className={`self-start mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${BADGE_CLS[q]}`}>
          {BADGE_LABEL[q]}
        </span>
      )}
    </div>
  );
}

// ── AI comment ────────────────────────────────────────────────────────────────

function buildAiComment(kpi: BalanceKPI): string {
  const eQ = rate('ebitdaPerc', kpi.ebitdaPerc);
  const pQ = rate('pfnEbitda',  kpi.pfnEbitda);
  const rQ = rate('roe',        kpi.roe);
  const lQ = rate('currentRatio', kpi.currentRatio);
  return [
    `L'EBITDA Margin al ${fmtPct(kpi.ebitdaPerc)} ${eQ === 'good' ? "evidenzia un'ottima efficienza operativa" : eQ === 'warn' ? 'indica una discreta efficienza industriale' : 'segnala margini compressi che richiedono intervento'} nell'anno ${kpi.anno}.`,
    '',
    `Il rapporto PFN/EBITDA a ${fmtX(kpi.pfnEbitda)} ${pQ === 'good' ? 'certifica un\'eccellente sostenibilità del debito (benchmark: < 2.0×)' : pQ === 'warn' ? 'si posiziona nella fascia di normalità settoriale (2–4×)' : 'segnala leva eccessiva — priorità di deleveraging'}. La PFN ammonta a ${fmtEurK(kpi.pfn)}.`,
    '',
    `Il ROE al ${fmtPct(kpi.roe)} ${rQ === 'good' ? 'riflette un\'elevata creazione di valore per gli azionisti' : rQ === 'warn' ? 'mostra una remunerazione del capitale nella norma' : 'indica una redditività per gli azionisti sotto le attese di mercato'}.`,
    '',
    `Il Cash Conversion Cycle è di ${fmtGg(kpi.ccc)} (DSO ${fmtGg(kpi.dso)} + DIO ${fmtGg(kpi.dio)} − DPO ${fmtGg(kpi.dpo)}). Il Current Ratio è ${fmtX(kpi.currentRatio)}${lQ === 'good' ? ' — posizione solida' : lQ === 'warn' ? ' — margini accettabili' : ' — potenziale tensione di liquidità a breve'}.`,
  ].join('\n');
}

// ── Glossario ─────────────────────────────────────────────────────────────────

const GLOSSARIO = [
  { kpi: 'RICAVI',              formula: '—',                                        desc: 'Fatturato netto del periodo.' },
  { kpi: 'EBITDA',              formula: 'Ricavi − CDV − OPEX',                       desc: 'Risultato operativo lordo prima di ammortamenti e oneri finanziari. Indicatore di redditività industriale.' },
  { kpi: 'EBIT',                formula: 'EBITDA − Ammortamenti',                    desc: 'Risultato operativo netto. Base per il calcolo del ROI.' },
  { kpi: 'Utile Netto',         formula: 'EBIT − Oneri Fin. − Imposte',              desc: 'Risultato finale di competenza degli azionisti.' },
  { kpi: 'PFN',                 formula: 'Deb.Fin.BT + LT − Liquidità',              desc: 'Posizione Finanziaria Netta. Se positiva = indebitato netto; se negativa = cassa netta.' },
  { kpi: 'PFN / EBITDA',        formula: 'PFN ÷ EBITDA',                             desc: 'Capacità di rimborso del debito. Soglia sana: < 3×; allerta: > 4×.' },
  { kpi: 'ROE',                 formula: 'Utile Netto ÷ Patrimonio Netto × 100',     desc: 'Rendimento del capitale proprio. Ottimo ≥ 15%.' },
  { kpi: 'ROI',                 formula: 'EBIT ÷ (PN + Deb.Fin.Tot.) × 100',        desc: 'Redditività del capitale investito (operativo + finanziario).' },
  { kpi: 'Current Ratio',       formula: 'Attivo Corrente ÷ Passivo Corrente',       desc: 'Solvibilità a breve. Sano ≥ 1.5×; critico < 1.0×.' },
  { kpi: 'Quick Ratio',         formula: '(Attivo Corr. − Magazzino) ÷ Pass. Corr.',desc: 'Liquidità senza scorte. Sano ≥ 1.0×.' },
  { kpi: 'Cash Ratio',          formula: 'Liquidità ÷ Passivo Corrente',             desc: 'Copertura con sole disponibilità immediate.' },
  { kpi: 'DSO',                 formula: 'Crediti Comm. ÷ (Ricavi ÷ 365)',           desc: 'Giorni medi di incasso dai clienti. Minore è meglio.' },
  { kpi: 'DIO',                 formula: 'Magazzino ÷ (CDV ÷ 365)',                  desc: 'Giorni medi di rotazione del magazzino. Minore è meglio.' },
  { kpi: 'DPO',                 formula: 'Debiti Comm. ÷ (CDV ÷ 365)',               desc: 'Giorni medi di pagamento ai fornitori. Maggiore è meglio (entro limiti contrattuali).' },
  { kpi: 'CCC',                 formula: 'DSO + DIO − DPO',                          desc: 'Cash Conversion Cycle: giorni necessari per convertire gli investimenti in entrate di cassa. Minore è meglio.' },
  { kpi: 'Debt / Equity',       formula: 'Deb.Fin.Tot. ÷ Patrimonio Netto',         desc: 'Leva finanziaria. Sano ≤ 1.0×; critico > 2.0×.' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function BalanceAnalysis() {
  const [years, setYears]           = useState<BalanceInputYear[]>(DEFAULT_YEARS);
  const [tab, setTab]               = useState<Tab>('dashboard');
  const [dashYear, setDashYear]     = useState(DEFAULT_YEARS.length - 1);
  const [userNote, setUserNote]     = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const kpis: BalanceKPI[] = useMemo(() => years.map(y => calculateBalanceKPIs(y)), [years]);

  const selKpi   = kpis[dashYear];
  const selInput = years[dashYear];
  const prevKpi  = dashYear > 0 ? kpis[dashYear - 1] : null;

  const aiComment = useMemo(() => selKpi ? buildAiComment(selKpi) : '', [selKpi]);

  const updateField = useCallback((yearIdx: number, field: EditableField, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (isNaN(value)) return;
    setYears(prev => prev.map((y, i) => i === yearIdx ? { ...y, [field]: value } : y));
  }, []);

  function addYear() {
    const last = years[years.length - 1];
    setYears(prev => [...prev, BLANK_YEAR(last ? last.anno + 1 : CY)]);
  }

  function removeYear(idx: number) {
    if (years.length <= 1) return;
    setYears(prev => prev.filter((_, i) => i !== idx));
    setDashYear(d => Math.min(d, years.length - 2));
  }

  // Charts
  const chartReddit = useMemo(() => years.map((y, i) => ({
    year: y.anno.toString(),
    'EBITDA %': +kpis[i].ebitdaPerc.toFixed(1),
    'ROE %':    +kpis[i].roe.toFixed(1),
  })), [years, kpis]);

  const chartCycle = useMemo(() => years.map((y, i) => ({
    year: y.anno.toString(),
    DSO: +kpis[i].dso.toFixed(0),
    DIO: +kpis[i].dio.toFixed(0),
    DPO: +kpis[i].dpo.toFixed(0),
  })), [years, kpis]);

  // ── Tab bar ───────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'input',     label: 'Inserimento dati' },
    { id: 'glossario', label: 'Glossario indicatori' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={pdfRef} className="min-h-full flex flex-col bg-slate-50">

      {/* Header */}
      <div className="px-6 pt-6 pb-0 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Analisi Bilancio</h1>
            <p className="text-xs text-slate-500">KPI Finanziari — {years.length} anni</p>
          </div>
        </div>
        {tab === 'dashboard' && (
          <button
            onClick={async () => {
              if (!pdfRef.current || exportingPdf) return;
              setExportingPdf(true);
              try { await exportPDF(pdfRef.current, 'bilancio-kpi.pdf'); }
              finally { setExportingPdf(false); }
            }}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" /> {exportingPdf ? 'Esportando…' : 'Esporta PDF'}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="px-6 mt-4 flex items-center gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`
              px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px
              ${tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-700'}
            `}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ──────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="flex-1 p-6 space-y-6 max-w-7xl">

          {/* Year selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">
              Indicatori chiave —
            </span>
            <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
              {years.map((y, i) => (
                <button
                  key={y.anno}
                  onClick={() => setDashYear(i)}
                  className={`
                    px-5 py-1.5 rounded-lg text-sm font-semibold transition-all
                    ${dashYear === i
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}
                  `}
                >
                  {y.anno}
                </button>
              ))}
            </div>
          </div>

          {/* KPI cards — 4 per row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <KpiCard
              label="RICAVI"
              value={fmtEur.format(selInput.ricavi)}
              neutral
            />
            <KpiCard
              label="EBITDA"
              value={fmtEur.format(selKpi.ebitda)}
              sub={`Margine ${fmtPct(selKpi.ebitdaPerc)}`}
              qKey="ebitdaPerc"
            />
            <KpiCard
              label="PFN"
              value={fmtEurK(selKpi.pfn)}
              sub="Indebitamento netto"
              neutral
            />
            <KpiCard
              label="PFN / EBITDA"
              value={fmtX(selKpi.pfnEbitda)}
              sub="< 3× sano"
              qKey="pfnEbitda"
            />
            <KpiCard
              label="DSO"
              value={fmtGg(selKpi.dso)}
              sub={prevKpi ? `▲ ${(selKpi.dso - prevKpi.dso).toFixed(1)} vs ${years[dashYear - 1]?.anno}` : 'Giorni incasso clienti'}
              neutral
            />
            <KpiCard
              label="DIO"
              value={fmtGg(selKpi.dio)}
              sub={prevKpi ? `▲ ${(selKpi.dio - prevKpi.dio).toFixed(1)} vs ${years[dashYear - 1]?.anno}` : 'Giorni rotazione magazzino'}
              neutral
            />
            <KpiCard
              label="DPO"
              value={fmtGg(selKpi.dpo)}
              sub={prevKpi ? `▲ ${(selKpi.dpo - prevKpi.dpo).toFixed(1)} vs ${years[dashYear - 1]?.anno}` : 'Giorni pagamento fornitori'}
              neutral
            />
            <KpiCard
              label="CASH CONVERSION CYCLE"
              value={fmtGg(selKpi.ccc)}
              sub="DSO + DIO – DPO"
              neutral
            />
            <KpiCard
              label="ROE"
              value={fmtPct(selKpi.roe)}
              qKey="roe"
            />
            <KpiCard
              label="ROI"
              value={fmtPct(selKpi.roi)}
              qKey="roi"
            />
            <KpiCard
              label="CURRENT RATIO"
              value={selKpi.currentRatio.toFixed(2)}
              sub="> 1.5 sano"
              qKey="currentRatio"
            />
            <KpiCard
              label="QUICK RATIO"
              value={selKpi.quickRatio.toFixed(2)}
              sub="> 1 sano"
              qKey="quickRatio"
            />
          </div>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-700">Trend Redditività</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-5">EBITDA Margin % e ROE % — confronto annuale</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartReddit} margin={{ top: 5, right: 10, bottom: 0, left: 0 }} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={v => [`${Number(v).toFixed(1)}%`]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="EBITDA %" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  <Bar dataKey="ROE %"    fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-700">Ciclo del Capitale Circolante</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-5">DSO · DIO · DPO — giorni</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartCycle} margin={{ top: 5, right: 10, bottom: 0, left: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v}gg`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip formatter={v => [`${Number(v).toFixed(0)} gg`]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="DSO" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="DIO" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="DPO" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI + Note */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
            <div className="bg-slate-900 rounded-2xl p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <MessageSquareText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Analisi AI — Bilancio {selInput.anno}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Generata in tempo reale dai KPI calcolati</p>
                </div>
              </div>
              <div className="flex-1 text-sm text-slate-300 leading-relaxed whitespace-pre-line font-light">
                {aiComment}
              </div>
              <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3">
                {([
                  { label: 'EBITDA %', v: selKpi.ebitdaPerc, fmt: fmtPct, qk: 'ebitdaPerc' },
                  { label: 'ROE',      v: selKpi.roe,        fmt: fmtPct, qk: 'roe' },
                  { label: 'PFN/EBITDA', v: selKpi.pfnEbitda, fmt: fmtX,  qk: 'pfnEbitda' },
                ] as { label: string; v: number; fmt: (v: number) => string; qk: string }[]).map(({ label, v, fmt, qk }) => {
                  const q = rate(qk, v);
                  return (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                      <p className={`text-sm font-bold tabular-nums ${
                        q === 'good' ? 'text-emerald-400' : q === 'warn' ? 'text-amber-400' : q === 'bad' ? 'text-red-400' : 'text-slate-400'
                      }`}>{fmt(v)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <PenLine className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Note del Consulente</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Anno {selInput.anno} — Considerazioni strategiche</p>
                </div>
              </div>
              <textarea
                value={userNote}
                onChange={e => setUserNote(e.target.value)}
                placeholder="Inserisci osservazioni, obiettivi, benchmark di settore o piani d'azione..."
                className="flex-1 resize-none rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed placeholder:text-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all min-h-40"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-[10px] text-slate-400">Le note non vengono salvate in questa demo</p>
                {userNote && <p className="text-[11px] text-slate-400 tabular-nums">{userNote.length} car.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── INSERIMENTO DATI TAB ───────────────────────────────────────────────── */}
      {tab === 'input' && (
        <div className="flex-1 p-6">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Inserisci i dati</h2>
              <p className="text-xs text-slate-400 mt-0.5">I KPI vengono ricalcolati in tempo reale</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYears(DEFAULT_YEARS)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors text-slate-500"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
              <button
                onClick={addYear}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Aggiungi anno
              </button>
            </div>
          </div>

          {/* Grid table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-52 sticky left-0 bg-white z-10">
                    Voce
                  </th>
                  {years.map((y, i) => (
                    <th key={y.anno} className="px-3 py-3 text-center text-xs font-bold text-slate-700 min-w-[120px]">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{y.anno}</span>
                        {years.length > 1 && (
                          <button
                            onClick={() => removeYear(i)}
                            className="p-0.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Rimuovi anno"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_DEFS.map(row => (
                  <>
                    {row.section && (
                      <tr key={`section-${row.section}`} className="bg-slate-50">
                        <td
                          colSpan={years.length + 1}
                          className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50"
                        >
                          {row.section === 'Conto Economico'    && <><TrendingUp className="inline w-3 h-3 mr-1.5" />{row.section}</>}
                          {row.section === 'Stato Patrimoniale' && <><Building2  className="inline w-3 h-3 mr-1.5" />{row.section}</>}
                          {row.section === 'Cash Flow'          && <><Activity   className="inline w-3 h-3 mr-1.5" />{row.section}</>}
                        </td>
                      </tr>
                    )}
                    <tr key={row.field} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-1.5 text-xs font-medium text-slate-600 sticky left-0 bg-white hover:bg-slate-50/50">
                        {row.label}
                      </td>
                      {years.map((y, i) => (
                        <td key={y.anno} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            value={y[row.field]}
                            onChange={e => updateField(i, row.field, e.target.value)}
                            className="
                              w-28 px-2 py-1.5 text-right text-xs font-semibold text-slate-800 tabular-nums
                              bg-slate-50 border border-slate-200 rounded-lg
                              focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100
                              transition-all [appearance:textfield]
                              [&::-webkit-inner-spin-button]:appearance-none
                              [&::-webkit-outer-spin-button]:appearance-none
                            "
                          />
                        </td>
                      ))}
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Computed highlights per year */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {years.map((y, i) => {
              const k = kpis[i];
              return (
                <div key={y.anno} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{y.anno}</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">EBITDA %</span>
                      <span className={`font-bold tabular-nums ${k.ebitdaPerc >= 15 ? 'text-emerald-600' : k.ebitdaPerc >= 5 ? 'text-amber-600' : 'text-red-500'}`}>
                        {fmtPct(k.ebitdaPerc)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">PFN/EBITDA</span>
                      <span className="font-bold tabular-nums text-slate-700">{fmtX(k.pfnEbitda)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">CCC</span>
                      <span className="font-bold tabular-nums text-slate-700">{fmtGg(k.ccc)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Current</span>
                      <span className={`font-bold tabular-nums ${k.currentRatio >= 1.5 ? 'text-emerald-600' : k.currentRatio >= 1.0 ? 'text-amber-600' : 'text-red-500'}`}>
                        {k.currentRatio.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GLOSSARIO TAB ──────────────────────────────────────────────────────── */}
      {tab === 'glossario' && (
        <div className="flex-1 p-6 max-w-4xl">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Glossario indicatori</h2>
          <p className="text-xs text-slate-400 mb-5">Formule e interpretazione di tutti i KPI calcolati</p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-40">KPI</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-64">Formula</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Descrizione</th>
                </tr>
              </thead>
              <tbody>
                {GLOSSARIO.map((g, idx) => (
                  <tr key={g.kpi} className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                    <td className="px-5 py-3 text-xs font-bold text-slate-800 whitespace-nowrap">{g.kpi}</td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{g.formula}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 leading-relaxed">{g.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
