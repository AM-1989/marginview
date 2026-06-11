import { useState, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, Building2, Droplets, AlertCircle,
  MessageSquareText, PenLine, Calculator, Upload, Loader2, Plus,
} from 'lucide-react';
import { calculateBalanceKPIs } from '../lib/balanceAnalysis';
import type { BalanceInputYear, BalanceKPI } from '../types';

// ── Rating system ─────────────────────────────────────────────────────────────

type KpiQuality = 'good' | 'warn' | 'bad';
type EditableField = keyof Omit<BalanceInputYear, 'anno'>;

interface Threshold { good: (v: number) => boolean; warn: (v: number) => boolean }

/*
 * Badge coloring schema — explained in the response:
 *
 *   Metric          │ Green (Ottimo)  │ Amber (Attenzione) │ Red (Critico)
 *   ────────────────┼─────────────────┼────────────────────┼──────────────
 *   EBITDA Margin   │ ≥ 15 %          │ 5–14.9 %           │ < 5 %
 *   EBIT Margin     │ ≥ 10 %          │ 3–9.9 %            │ < 3 %
 *   Net Margin      │ ≥  8 %          │ 2–7.9 %            │ < 2 %
 *   ROE             │ ≥ 15 %          │ 5–14.9 %           │ < 5 %
 *   ROA             │ ≥  8 %          │ 3–7.9 %            │ < 3 %
 *   Current Ratio   │ ≥  1.5×         │ 1.0–1.49×          │ < 1.0×
 *   Quick Ratio     │ ≥  1.0×         │ 0.7–0.99×          │ < 0.7×
 *   Cash Ratio      │ ≥  0.5×         │ 0.2–0.49×          │ < 0.2×
 *   Net Debt/EBITDA │ ≤  2.0×  ←INV  │ 2.01–4.0×          │ > 4.0×
 *   Debt/Equity     │ ≤  1.0×  ←INV  │ 1.01–2.0×          │ > 2.0×
 *   CCN (€)         │ > 0             │ > −100 k           │ ≤ −100 k
 */
const THR: Record<string, Threshold> = {
  ebitdaPerc:     { good: v => v >= 15,      warn: v => v >= 5      },
  ebitPerc:       { good: v => v >= 10,      warn: v => v >= 3      },
  utileNettoPerc: { good: v => v >= 8,       warn: v => v >= 2      },
  roe:            { good: v => v >= 15,      warn: v => v >= 5      },
  roa:            { good: v => v >= 8,       warn: v => v >= 3      },
  currentRatio:   { good: v => v >= 1.5,     warn: v => v >= 1.0    },
  quickRatio:     { good: v => v >= 1.0,     warn: v => v >= 0.7    },
  cashRatio:      { good: v => v >= 0.5,     warn: v => v >= 0.2    },
  netDebtEbitda:  { good: v => v <= 2.0,     warn: v => v <= 4.0    }, // inverted
  debtToEquity:   { good: v => v <= 1.0,     warn: v => v <= 2.0    }, // inverted
  ccn:            { good: v => v > 0,        warn: v => v > -100_000 },
};

function rate(key: string, v: number): KpiQuality {
  const t = THR[key];
  if (!t) return 'warn';
  return t.good(v) ? 'good' : t.warn(v) ? 'warn' : 'bad';
}

const BADGE: Record<KpiQuality, string> = {
  good: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  warn: 'bg-amber-100  text-amber-700  border border-amber-200',
  bad:  'bg-red-100    text-red-700    border border-red-200',
};
const BADGE_LABEL: Record<KpiQuality, string> = {
  good: 'Ottimo', warn: 'Attenzione', bad: 'Critico',
};
const BADGE_DOT: Record<KpiQuality, string> = { good: '●', warn: '◆', bad: '▲' };

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtEur  = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct  = (v: number) => `${v.toFixed(1)}%`;
const fmtX    = (v: number) => `${v.toFixed(2)}×`;
const fmtEurK = (v: number) => `€ ${(v / 1_000).toFixed(0)}k`;

// ── AI comment ────────────────────────────────────────────────────────────────

function buildAiComment(kpi: BalanceKPI, input: BalanceInputYear): string {
  const passCorr = input.debitiFornitori + input.altrePassivitaCorrente;
  const ccn      = input.attivitaCorrente - passCorr;

  const eq = (key: string, v: number) => rate(key, v);
  const eQ = eq('ebitdaPerc',   kpi.ebitdaPerc);
  const dQ = eq('netDebtEbitda', kpi.netDebtEbitda);
  const rQ = eq('roe',           kpi.roe);
  const lQ = eq('currentRatio',  kpi.currentRatio);

  return [
    `L'EBITDA Margin al ${fmtPct(kpi.ebitdaPerc)} ${eQ === 'good' ? 'evidenzia un\'ottima efficienza operativa' : eQ === 'warn' ? 'indica una discreta efficienza industriale' : 'segnala margini compressi che richiedono intervento'} nel ${kpi.anno}.`,
    '',
    `Il rapporto Net Debt/EBITDA a ${fmtX(kpi.netDebtEbitda)} ${dQ === 'good' ? 'certifica un\'eccellente sostenibilità del debito (benchmark: < 2.0×)' : dQ === 'warn' ? 'si posiziona nella fascia di normalità settoriale (2–4×)' : 'segnala leva eccessiva — priorità di deleveraging'}. Il debito netto ammonta a ${fmtEurK(kpi.netDebt)}.`,
    '',
    `Il ROE al ${fmtPct(kpi.roe)} ${rQ === 'good' ? 'riflette un\'elevata creazione di valore per gli azionisti' : rQ === 'warn' ? 'mostra una remunerazione del capitale nella norma' : 'indica una redditività per gli azionisti sotto le attese di mercato'}.`,
    '',
    `La struttura di liquidità mostra un Current Ratio di ${fmtX(kpi.currentRatio)}${lQ === 'good' ? ' — posizione solida' : lQ === 'warn' ? ' — margini accettabili' : ' — segnale di potenziale tensione a breve'}. Il CCN è ${ccn >= 0 ? `positivo a ${fmtEurK(ccn)}, a conferma della copertura delle passività correnti` : `negativo (${fmtEurK(ccn)}): si raccomanda monitoraggio della liquidità operativa`}.`,
  ].join('\n');
}

// ── Balance Excel parser ──────────────────────────────────────────────────────

const BLANK_YEAR = (anno: number): BalanceInputYear => ({
  anno,
  ricavi: 0, costoDelVenduto: 0, costiOperativi: 0, ammortamenti: 0,
  oneriFinanziari: 0, imposte: 0,
  attivitaCorrente: 0, rimanenze: 0, creditiClienti: 0, liquidita: 0,
  attivitaNonCorrente: 0,
  patrimoniNetto: 0, debitiFinanziari: 0, debitiFornitori: 0,
  altrePassivitaCorrente: 0,
});

function parseBalanceExcel(raw: Record<string, unknown>[]): BalanceInputYear[] {
  const n = (v: unknown) => parseFloat(String(v ?? '0').replace(',', '.')) || 0;
  const keys = (raw[0] ? Object.keys(raw[0]) : []).map(k => k.trim());
  const find = (...aliases: string[]) => {
    const lower = keys.map(k => k.toLowerCase());
    for (const a of aliases) { const i = lower.indexOf(a); if (i !== -1) return keys[i]; }
    return undefined;
  };
  const C = {
    anno:  find('anno', 'year', 'esercizio'),
    ricavi: find('ricavi', 'ricavi netti', 'revenue', 'fatturato'),
    cdv:   find('costodelvenduto', 'costo del venduto', 'cogs', 'costo venduto'),
    cop:   find('costioperativi', 'costi operativi', 'opex', 'costi operazioni'),
    amm:   find('ammortamenti', 'ammortamenti & svalutazioni', 'depreciation', 'd&a'),
    of:    find('onerifinanziari', 'oneri finanziari', 'interessi passivi', 'interest expense'),
    imp:   find('imposte', 'taxes', 'tasse'),
    ac:    find('attivitacorrente', 'attivita corrente', 'current assets'),
    rim:   find('rimanenze', 'inventories', 'scorte', 'inventory'),
    cred:  find('crediticlienti', 'crediti clienti', 'accounts receivable', 'crediti'),
    liq:   find('liquidita', 'cash', 'cassa'),
    anc:   find('attivitanoncorrente', 'attivita non corrente', 'fixed assets', 'immobilizzazioni'),
    pn:    find('patrimionionetto', 'patrimonio netto', 'equity', 'capital'),
    df:    find('debitifinanziari', 'debiti finanziari', 'financial debt', 'debt'),
    debit: find('debitifornitori', 'debiti fornitori', 'accounts payable', 'fornitori'),
    altpass: find('altrepassivitacorrente', 'altre passivita corrente', 'other current liabilities'),
  };
  return raw.map((r, i) => ({
    anno:                  C.anno  ? n(r[C.anno])  : new Date().getFullYear() + i,
    ricavi:                C.ricavi ? n(r[C.ricavi]) : 0,
    costoDelVenduto:       C.cdv   ? n(r[C.cdv])   : 0,
    costiOperativi:        C.cop   ? n(r[C.cop])   : 0,
    ammortamenti:          C.amm   ? n(r[C.amm])   : 0,
    oneriFinanziari:       C.of    ? n(r[C.of])    : 0,
    imposte:               C.imp   ? n(r[C.imp])   : 0,
    attivitaCorrente:      C.ac    ? n(r[C.ac])    : 0,
    rimanenze:             C.rim   ? n(r[C.rim])   : 0,
    creditiClienti:        C.cred  ? n(r[C.cred])  : 0,
    liquidita:             C.liq   ? n(r[C.liq])   : 0,
    attivitaNonCorrente:   C.anc   ? n(r[C.anc])   : 0,
    patrimoniNetto:        C.pn    ? n(r[C.pn])    : 0,
    debitiFinanziari:      C.df    ? n(r[C.df])    : 0,
    debitiFornitori:       C.debit ? n(r[C.debit]) : 0,
    altrePassivitaCorrente: C.altpass ? n(r[C.altpass]) : 0,
  })).filter(y => y.anno > 1900);
}

// ── Sub-components (defined outside main to avoid React remount on re-render) ─

function ComputedLine({ label, value, pct }: { label: string; value: number; pct?: number }) {
  return (
    <div className="flex items-center justify-between py-2 px-3.5 rounded-lg bg-slate-900 text-white my-1.5">
      <span className="text-xs font-semibold tracking-wide">{label}</span>
      <div className="text-right tabular-nums">
        <span className="text-sm font-bold">{fmtEur.format(value)}</span>
        {pct !== undefined && (
          <span className={`text-xs ml-2 ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ({fmtPct(pct)})
          </span>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, displayValue, qKey, rawValue }: {
  label: string;
  displayValue: string;
  qKey: string;
  rawValue: number;
}) {
  const q = rate(qKey, rawValue);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums leading-none mb-2.5">{displayValue}</p>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE[q]}`}>
        {BADGE_DOT[q]} {BADGE_LABEL[q]}
      </span>
    </div>
  );
}

interface NumInputProps {
  field: EditableField;
  label: string;
  indent?: boolean;
  value: number;
  onChange: (field: EditableField, raw: string) => void;
}

function NumInput({ field, label, indent = false, value, onChange }: NumInputProps) {
  return (
    <div className={`flex items-center gap-3 py-1.5 ${indent ? 'pl-4 border-l-2 border-slate-100 ml-1' : ''}`}>
      <label className={`flex-1 min-w-0 text-xs font-medium truncate ${indent ? 'text-slate-400' : 'text-slate-600'}`}>
        {label}
      </label>
      <div className="relative flex-shrink-0">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">€</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(field, e.target.value)}
          className="
            w-36 pl-7 pr-2 py-1.5 text-right text-xs font-semibold text-slate-800 tabular-nums
            bg-slate-50 border border-slate-200 rounded-lg
            focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100
            transition-all [appearance:textfield]
            [&::-webkit-inner-spin-button]:appearance-none
            [&::-webkit-outer-spin-button]:appearance-none
          "
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BalanceAnalysis() {
  const [years, setYears]             = useState<BalanceInputYear[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [userNote, setUserNote]       = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [uploadDragging, setUploadDragging] = useState(false);
  const uploadInputRef                = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setLoadingFile(true);
    try {
      const ab  = await file.arrayBuffer();
      const wb  = XLSX.read(ab);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      const parsed = parseBalanceExcel(raw);
      if (parsed.length === 0) { alert('Nessuna riga valida trovata nel file.'); return; }
      setYears(parsed);
      setSelectedIdx(0);
    } catch { alert('Errore lettura file. Assicurati che sia un Excel valido.'); }
    finally { setLoadingFile(false); }
  }

  // Live KPI calculation for all years
  const kpis: BalanceKPI[] = useMemo(() => years.map(y => calculateBalanceKPIs(y)), [years]);

  const currentInput = years[selectedIdx];
  const currentKPI   = kpis[selectedIdx];

  // Income statement cascade (read-only display)
  const ceCalc = useMemo(() => {
    if (!currentInput) return { ebitda: 0, ebitdaPerc: 0, ebit: 0, ebitPerc: 0, utileNetto: 0, utileNettoPerc: 0 };
    const { ricavi, costoDelVenduto, costiOperativi, ammortamenti, oneriFinanziari, imposte } = currentInput;
    const ebitda     = ricavi - costoDelVenduto - costiOperativi;
    const ebit       = ebitda - ammortamenti;
    const ebt        = ebit   - oneriFinanziari;
    const utileNetto = ebt    - imposte;
    return {
      ebitda,
      ebitdaPerc:     ricavi > 0 ? ebitda     / ricavi * 100 : 0,
      ebit,
      ebitPerc:       ricavi > 0 ? ebit       / ricavi * 100 : 0,
      utileNetto,
      utileNettoPerc: ricavi > 0 ? utileNetto / ricavi * 100 : 0,
    };
  }, [currentInput]);

  // Balance sheet aggregates (read-only display)
  const spCalc = useMemo(() => {
    if (!currentInput) return { attivoTotale: 0, passivitaCorrente: 0, ccn: 0 };
    const { attivitaCorrente, attivitaNonCorrente, debitiFornitori, altrePassivitaCorrente } = currentInput;
    const attivoTotale      = attivitaCorrente + attivitaNonCorrente;
    const passivitaCorrente = debitiFornitori   + altrePassivitaCorrente;
    return { attivoTotale, passivitaCorrente, ccn: attivitaCorrente - passivitaCorrente };
  }, [currentInput]);

  // Chart data — both years side by side
  const chartMargini = useMemo(() => years.map((y, i) => ({
    year: y.anno.toString(),
    'EBITDA %': +kpis[i].ebitdaPerc.toFixed(1),
    'ROE %':    +kpis[i].roe.toFixed(1),
  })), [years, kpis]);

  const chartDebt = useMemo(() => years.map((y, i) => ({
    year: y.anno.toString(),
    'Net Debt/EBITDA': +kpis[i].netDebtEbitda.toFixed(2),
  })), [years, kpis]);

  const aiComment = useMemo(
    () => currentKPI && currentInput ? buildAiComment(currentKPI, currentInput) : '',
    [currentKPI, currentInput],
  );

  const updateField = useCallback((field: EditableField, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (isNaN(value)) return;
    setYears(prev =>
      prev.map((y, i) => i === selectedIdx ? { ...y, [field]: value } : y)
    );
  }, [selectedIdx]);

  // ─────────────────────────────────────────────────────────────────────────────
  if (years.length === 0) {
    return (
      <div className="min-h-full flex flex-col bg-slate-50">
        <div className="px-8 pt-8 pb-2 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Analisi Bilancio</h1>
            <p className="text-xs text-slate-500">KPI Finanziari</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-xl space-y-4">
            <div
              className={`border-2 border-dashed rounded-2xl p-14 flex flex-col items-center gap-6 cursor-pointer transition-colors bg-white ${
                uploadDragging
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50/40'
              }`}
              onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
              onDragLeave={() => setUploadDragging(false)}
              onDrop={e => {
                e.preventDefault(); setUploadDragging(false);
                const f = e.dataTransfer.files[0]; if (f) handleFile(f);
              }}
              onClick={() => uploadInputRef.current?.click()}
            >
              {loadingFile
                ? <Loader2 className="w-12 h-12 text-violet-500 animate-spin" />
                : <Upload className="w-12 h-12 text-slate-300" />
              }
              <div className="text-center">
                <h2 className="text-base font-semibold text-slate-700 mb-1">Carica il file Excel</h2>
                <p className="text-sm text-slate-400">Trascina qui il file oppure clicca per selezionarlo</p>
              </div>
              <div className="w-full border-t border-slate-100 pt-5 space-y-2 text-center">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">Colonne:</span>{' '}
                  Anno · Ricavi · CostoDelVenduto · CostiOperativi · Ammortamenti · OneriFinanziari · Imposte
                </p>
                <p className="text-xs text-slate-400">
                  + AttivitaCorrente · Rimanenze · CreditiClienti · Liquidita · AttivitaNonCorrente · PatrimoniNetto · DebitiFinanziari · DebitiFornitori · AltrePassivitaCorrente
                </p>
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            <button
              onClick={() => setYears([BLANK_YEAR(new Date().getFullYear())])}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Inserisci dati manualmente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl">

      {/* ── Header + Year tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex-1 min-w-48">
          <h2 className="text-xl font-bold text-slate-900">Analisi Bilancio — KPI Finanziari</h2>
          <p className="text-sm text-slate-500 mt-1">
            Inserimento dati · ricalcolo in tempo reale · {years.length} anni configurati
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
          {years.map((y, i) => (
            <button
              key={y.anno}
              onClick={() => setSelectedIdx(i)}
              className={`
                px-6 py-2 rounded-lg text-sm font-semibold transition-all
                ${selectedIdx === i
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}
              `}
            >
              Anno {y.anno}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input Form ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <Calculator className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            Dati di Input — Anno {currentInput.anno}
          </h3>
          <span className="text-[11px] text-slate-400 ml-1">
            I valori derivati (EBITDA, EBIT, ecc.) sono calcolati automaticamente
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

          {/* Conto Economico */}
          <div className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Conto Economico
            </p>
            <div className="space-y-0.5">
              <NumInput field="ricavi"           label="Ricavi netti"                   value={currentInput.ricavi}           onChange={updateField} />
              <NumInput field="costoDelVenduto"  label="Costo del venduto"              value={currentInput.costoDelVenduto}  onChange={updateField} />
              <NumInput field="costiOperativi"   label="Costi operativi"                value={currentInput.costiOperativi}   onChange={updateField} />
              <ComputedLine label="▸ EBITDA"     value={ceCalc.ebitda}   pct={ceCalc.ebitdaPerc} />
              <NumInput field="ammortamenti"     label="Ammortamenti & Svalutazioni"    value={currentInput.ammortamenti}     onChange={updateField} />
              <ComputedLine label="▸ EBIT"       value={ceCalc.ebit}     pct={ceCalc.ebitPerc} />
              <NumInput field="oneriFinanziari"  label="Oneri finanziari netti"         value={currentInput.oneriFinanziari}  onChange={updateField} />
              <NumInput field="imposte"          label="Imposte sul reddito"            value={currentInput.imposte}          onChange={updateField} />
              <ComputedLine label="▸ Utile Netto" value={ceCalc.utileNetto} pct={ceCalc.utileNettoPerc} />
            </div>
          </div>

          {/* Stato Patrimoniale */}
          <div className="p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" /> Stato Patrimoniale
            </p>
            <div className="space-y-0.5">
              <NumInput field="attivitaCorrente"      label="Attività correnti (totale)"  value={currentInput.attivitaCorrente}      onChange={updateField} />
              <NumInput field="liquidita"             label="di cui: Liquidità"            value={currentInput.liquidita}             onChange={updateField} indent />
              <NumInput field="creditiClienti"        label="di cui: Crediti clienti"      value={currentInput.creditiClienti}        onChange={updateField} indent />
              <NumInput field="rimanenze"             label="di cui: Rimanenze"            value={currentInput.rimanenze}             onChange={updateField} indent />
              <NumInput field="attivitaNonCorrente"   label="Attività non correnti"        value={currentInput.attivitaNonCorrente}   onChange={updateField} />
              <ComputedLine label="▸ Totale Attivo"  value={spCalc.attivoTotale} />
              <div className="py-1" />
              <NumInput field="patrimoniNetto"        label="Patrimonio netto"             value={currentInput.patrimoniNetto}        onChange={updateField} />
              <NumInput field="debitiFinanziari"      label="Debiti finanziari"            value={currentInput.debitiFinanziari}      onChange={updateField} />
              <NumInput field="debitiFornitori"       label="Debiti verso fornitori"       value={currentInput.debitiFornitori}       onChange={updateField} />
              <NumInput field="altrePassivitaCorrente" label="Altre passività correnti"   value={currentInput.altrePassivitaCorrente} onChange={updateField} />
              <ComputedLine label="▸ Passività Correnti" value={spCalc.passivitaCorrente} />
              <ComputedLine label="▸ CCN (Cap. Circolante Netto)" value={spCalc.ccn} />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Group 1: Redditività ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Redditività</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="EBITDA Margin"  displayValue={fmtPct(currentKPI.ebitdaPerc)}    qKey="ebitdaPerc"     rawValue={currentKPI.ebitdaPerc} />
          <KpiCard label="EBIT Margin"    displayValue={fmtPct(currentKPI.ebitPerc)}       qKey="ebitPerc"       rawValue={currentKPI.ebitPerc} />
          <KpiCard label="Net Margin"     displayValue={fmtPct(currentKPI.utileNettoPerc)} qKey="utileNettoPerc" rawValue={currentKPI.utileNettoPerc} />
          <KpiCard label="ROE"            displayValue={fmtPct(currentKPI.roe)}            qKey="roe"            rawValue={currentKPI.roe} />
          <KpiCard label="ROA"            displayValue={fmtPct(currentKPI.roa)}            qKey="roa"            rawValue={currentKPI.roa} />
        </div>
      </div>

      {/* ── KPI Group 2: Solidità & Debito ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Solidità & Debito</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Debt / Equity"     displayValue={fmtX(currentKPI.debtToEquity)}  qKey="debtToEquity"  rawValue={currentKPI.debtToEquity} />
          <KpiCard label="Net Debt / EBITDA" displayValue={fmtX(currentKPI.netDebtEbitda)} qKey="netDebtEbitda" rawValue={currentKPI.netDebtEbitda} />

          {/* Net Debt — custom card (sign matters) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">Net Debt</p>
            <p className={`text-xl font-bold tabular-nums leading-none mb-2.5 ${currentKPI.netDebt < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
              {fmtEurK(currentKPI.netDebt)}
            </p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${currentKPI.netDebt < 0 ? BADGE.good : BADGE.warn}`}>
              {currentKPI.netDebt < 0 ? '● Cassa netta' : '◆ Indebitato'}
            </span>
          </div>

          {/* CCN — custom card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">CCN</p>
            <p className={`text-xl font-bold tabular-nums leading-none mb-2.5 ${spCalc.ccn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtEurK(spCalc.ccn)}
            </p>
            {(() => {
              const q = rate('ccn', spCalc.ccn);
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE[q]}`}>
                  {BADGE_DOT[q]} {spCalc.ccn >= 0 ? 'Positivo' : 'Negativo'}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── KPI Group 3: Liquidità ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Droplets className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Liquidità</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <KpiCard label="Current Ratio" displayValue={fmtX(currentKPI.currentRatio)} qKey="currentRatio" rawValue={currentKPI.currentRatio} />
          <KpiCard label="Quick Ratio"   displayValue={fmtX(currentKPI.quickRatio)}   qKey="quickRatio"   rawValue={currentKPI.quickRatio} />
          <KpiCard label="Cash Ratio"    displayValue={fmtX(currentKPI.cashRatio)}    qKey="cashRatio"    rawValue={currentKPI.cashRatio} />
        </div>
      </div>

      {/* ── Trend Charts ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Margini & ROE */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700">Trend Redditività</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-5">EBITDA Margin % e ROE % — confronto annuale</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartMargini} margin={{ top: 5, right: 10, bottom: 0, left: 0 }} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)}%`]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="EBITDA %" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48} />
              <Bar dataKey="ROE %"    fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Net Debt/EBITDA */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700">Leva Finanziaria</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-5">Net Debt / EBITDA — soglie di riferimento 2× e 4×</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartDebt} margin={{ top: 5, right: 30, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v}×`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)}×`]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="4 3"
                label={{ value: 'Sicuro 2×', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
              <ReferenceLine y={4} stroke="#ef4444" strokeDasharray="4 3"
                label={{ value: 'Limite 4×', position: 'right', fontSize: 10, fill: '#ef4444' }} />
              <Bar dataKey="Net Debt/EBITDA" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Comments ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">

        {/* AI */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <MessageSquareText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Analisi AI — Bilancio {currentInput.anno}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Generata in tempo reale dai KPI calcolati</p>
            </div>
          </div>
          <div className="flex-1 text-sm text-slate-300 leading-relaxed whitespace-pre-line font-light">
            {aiComment}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3">
            {([
              { label: 'EBITDA %',  v: currentKPI.ebitdaPerc,    fmt: fmtPct, qk: 'ebitdaPerc'    },
              { label: 'ROE',       v: currentKPI.roe,            fmt: fmtPct, qk: 'roe'           },
              { label: 'ND/EBITDA', v: currentKPI.netDebtEbitda,  fmt: fmtX,   qk: 'netDebtEbitda' },
            ] as { label: string; v: number; fmt: (v: number) => string; qk: string }[]).map(({ label, v, fmt, qk }) => {
              const q = rate(qk, v);
              return (
                <div key={label} className="text-center">
                  <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                  <p className={`text-sm font-bold tabular-nums ${
                    q === 'good' ? 'text-emerald-400' : q === 'warn' ? 'text-amber-400' : 'text-red-400'
                  }`}>{fmt(v)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* User note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Note del Consulente</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Anno {currentInput.anno} — Considerazioni strategiche</p>
            </div>
          </div>
          <textarea
            value={userNote}
            onChange={e => setUserNote(e.target.value)}
            placeholder="Inserisci osservazioni, obiettivi di miglioramento, benchmark di settore o piani d'azione..."
            className="
              flex-1 resize-none rounded-xl bg-slate-50 border border-slate-200
              p-4 text-sm text-slate-700 leading-relaxed placeholder:text-slate-300
              focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
              transition-all min-h-52
            "
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-400">Le note non vengono salvate in questa demo</p>
            {userNote && <p className="text-[11px] text-slate-400 tabular-nums">{userNote.length} car.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
