// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterDim = 'brand' | 'categoria' | 'sottocategoria' | 'formato' | 'paese' | 'canale';

export const FILTER_DIMS: FilterDim[] = [
  'brand', 'categoria', 'sottocategoria', 'formato', 'paese', 'canale',
];

export const FILTER_DIM_LABELS: Record<FilterDim, string> = {
  brand: 'Brand',
  categoria: 'Categoria',
  sottocategoria: 'Sottocategoria',
  formato: 'Formato',
  paese: 'Paese',
  canale: 'Canale',
};

export interface VarRow {
  codiceMateriale: string;
  descrizione: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  paese: string;
  canale: string;
  anno: number;
  mese: number;
  quantita: number;
  fatturato: number;
  costoUnitario: number;
  costoTotale: number;
}

export interface PeriodKey {
  anno: number;
  mese: number;
  key: string;    // "2025-01"
  label: string;  // "Gennaio 2025"
}

export interface FilterOptions {
  brand: string[];
  categoria: string[];
  sottocategoria: string[];
  formato: string[];
  paese: string[];
  canale: string[];
}

export interface ComparedLine {
  key: string;         // = codiceMateriale
  codice: string;
  descrizione: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  // P1
  q1: number;
  rev1: number;
  cost1: number;
  p1: number | null;   // avg unit price P1
  c1: number | null;   // avg unit cost P1
  margin1: number;
  marginPct1: number | null;
  // P2
  q2: number;
  rev2: number;
  cost2: number;
  p2: number | null;
  c2: number | null;
  margin2: number;
  marginPct2: number | null;
  // Delta
  deltaMargin: number;
  deltaMarginPct: number | null;  // pp (decimal)
  deltaRev: number;
  isOnlyP1: boolean;
  isOnlyP2: boolean;
}

export interface TableGroup {
  key: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  rev1: number;
  cost1: number;
  margin1: number;
  marginPct1: number | null;
  rev2: number;
  cost2: number;
  margin2: number;
  marginPct2: number | null;
  effVolMix: number | null;
  effPrezzo: number | null;
  effCosto: number | null;
  effTotale: number | null;
  lines: ComparedLine[];
}

export interface WaterfallPoint {
  name: string;
  spacer: number;
  total: number;
  green: number;
  red: number;
  rawValue: number;
  isTotal: boolean;
}

export interface EffectsResult {
  totalRev1: number;
  totalRev2: number;
  totalCost1: number;
  totalCost2: number;
  totalMargin1: number;
  totalMargin2: number;
  marginPctP1: number;
  marginPctP2: number;
  // Effects in margin pp (decimal: 0.023 = 2.3 pp)
  effVolume: number;
  effMix: number;
  effPrezzo: number;
  effCosto: number;
  // Quadrature
  expectedP2: number;
  quadratureDiff: number;
  isBalanced: boolean;
  // Detail
  lines: ComparedLine[];
  tableGroups: TableGroup[];
  // Waterfall data
  waterfallRev: WaterfallPoint[];
  waterfallMargin: WaterfallPoint[];
  waterfallMarginPct: WaterfallPoint[];
  // Drivers
  topVariations: ComparedLine[];
  topBest: ComparedLine[];
  topWorst: ComparedLine[];
}

export interface AIInsight {
  title: string;
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}

// ─── Debug flag ────────────────────────────────────────────────────────────────
// Set to true to enable debug logging to the browser console
const DEBUG_VARIANCE = true;
function dbg(...args: unknown[]) {
  if (DEBUG_VARIANCE) console.log('[VARIANCE]', ...args);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

// ─── STEP 1: parseNum — robust number parser ───────────────────────────────────
// Critical: XLSX.sheet_to_json returns numeric cells as JS numbers.
// Never convert a JS number to string — the dot-stripping logic would corrupt decimals.
// Example: 524.67 → String → "524.67" → removeAllDots → "52467" → 100× inflation (BUG).

export function parseNum(v: unknown): number {
  // JS number from XLSX — use directly, no string conversion
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;

  let s = String(v).replace(/[€\s]/g, '').trim();
  if (!s) return 0;

  // Italian "1.234,56": has both dot and comma → dot = thousands sep, comma = decimal sep
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // Italian "1234,56": only comma → comma = decimal sep
  else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  // English "1234.56": only dot → dot = decimal sep, keep as-is
  // Note: "1.234" (Italian thousands) is ambiguous without a comma.
  // We cannot reliably distinguish, but numeric Excel cells never reach this branch
  // (they are handled by the typeof check above).

  return parseFloat(s) || 0;
}

function parseMese(v: unknown): number {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'number') {
    const n = Math.round(v);
    return n >= 1 && n <= 12 ? n : 1;
  }
  const s = String(v).trim();
  const byName = MONTH_NAMES.findIndex(m => m.toLowerCase() === s.toLowerCase());
  if (byName > 0) return byName;
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return Math.round(n);
  const m = s.match(/^\d{4}-(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  return 1;
}

function findCol(headers: string[], aliases: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase().trim());
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

// ─── Column aliases ────────────────────────────────────────────────────────────

const COL_MAP: Record<string, string[]> = {
  codiceMateriale: [
    'codice referenza/servizio', 'codice referenza / servizio',
    'codice materiale', 'codice referenza', 'codice', 'sku', 'articolo',
    'cod. art.', 'codice art', 'id', 'referenza', 'codice prodotto',
  ],
  descrizione: [
    'descrizione referenza/servizio', 'descrizione referenza / servizio',
    'descrizione materiale', 'descrizione referenza', 'descrizione', 'nome',
    'prodotto', 'description', 'product', 'nome prodotto',
  ],
  brand:          ['brand', 'marca'],
  categoria:      ['categoria', 'category', 'famiglia', 'famiglia prodotto'],
  sottocategoria: ['sottocategoria', 'subcategory', 'sub categoria', 'sub-categoria'],
  formato:        ['formato', 'format', 'pack', 'confezione'],
  paese:          ['paese', 'paese di vendita', 'country', 'nazione'],
  canale:         ['canale', 'canale di vendita', 'channel', 'canale vendita'],
  anno:           ['anno', 'year', 'esercizio', 'anno competenza', 'anno di competenza'],
  mese:           ['mese', 'month', 'mese competenza', 'mese di competenza'],
  quantita: [
    'quantità venduta', 'quantita venduta', 'quantità', 'quantita',
    'qty', 'quantity', 'pezzi', 'volume',
  ],
  fatturato: [
    'fatturato', 'ricavi', 'vendite', 'revenue', 'sales', 'fatturato netto',
    'importo', 'ricavo', 'totale fatturato', 'ricavi netti',
  ],
  // Unit cost — must NOT be a "totale/total" column (those are detected separately)
  costoUnitario: [
    'costo unitario/tariffa', 'costo unitario / tariffa',
    'costo unitario', 'tariffa', 'costo medio', 'unit cost', 'unitcost',
    'costo unit.', 'costo/unità', 'costo/unita', 'costo per unità', 'costo per pezzo',
  ],
  // Total cost column — if present, use directly (do NOT multiply by quantity)
  costoTotaleCol: [
    'costo totale', 'costi totali', 'total cost', 'costo', 'costi',
    'totale costi', 'costo variabile totale',
  ],
};

// ─── STEP 2: normalizeRows — parse Excel raw rows into VarRow[] ────────────────

export function normalizeRows(raw: Record<string, unknown>[]): VarRow[] {
  if (!raw.length) return [];
  const headers = Object.keys(raw[0]).map(h => String(h).trim());

  const cols: Partial<Record<string, string>> = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    cols[field] = findCol(headers, aliases);
  }

  dbg('Column mapping:', cols);
  dbg('Total raw rows:', raw.length);

  // If both costoUnitario and costoTotaleCol are found, prefer costoUnitario.
  // costoTotaleCol is only used if costoUnitario is missing.
  const hasCostoUnit  = !!cols['costoUnitario'];
  const hasCostoTot   = !!cols['costoTotaleCol'];
  const useTotalCost  = !hasCostoUnit && hasCostoTot;

  if (useTotalCost) {
    dbg('WARNING: No unit cost column found. Using total cost column directly (will NOT multiply by qty).');
  }
  if (!cols['fatturato']) {
    dbg('WARNING: No fatturato column found! KPIs will be wrong.');
  }
  if (!cols['codiceMateriale']) {
    dbg('WARNING: No product code column found. Using row index as key.');
  }

  const get = (r: Record<string, unknown>, field: string) =>
    cols[field] ? r[cols[field]!] : undefined;

  const rows: VarRow[] = [];
  let skipped = 0;

  raw.forEach((r, i) => {
    const quantita  = parseNum(get(r, 'quantita'));
    const fatturato = parseNum(get(r, 'fatturato'));

    let costoUnitario: number;
    let costoTotale: number;

    if (useTotalCost) {
      costoTotale   = parseNum(get(r, 'costoTotaleCol'));
      costoUnitario = quantita > 0 ? costoTotale / quantita : 0;
    } else {
      costoUnitario = parseNum(get(r, 'costoUnitario'));
      costoTotale   = costoUnitario * quantita;
    }

    // Skip rows with no meaningful data
    if (fatturato === 0 && quantita === 0) { skipped++; return; }

    rows.push({
      codiceMateriale: String(get(r, 'codiceMateriale') ?? `R${i + 1}`).trim(),
      descrizione:     String(get(r, 'descrizione')     ?? '').trim(),
      brand:           String(get(r, 'brand')           ?? '').trim(),
      categoria:       String(get(r, 'categoria')       ?? '').trim(),
      sottocategoria:  String(get(r, 'sottocategoria')  ?? '').trim(),
      formato:         String(get(r, 'formato')         ?? '').trim(),
      paese:           String(get(r, 'paese')           ?? '').trim(),
      canale:          String(get(r, 'canale')          ?? '').trim(),
      anno:            parseNum(get(r, 'anno')) || new Date().getFullYear(),
      mese:            parseMese(get(r, 'mese')),
      quantita,
      fatturato,
      costoUnitario,
      costoTotale,
    });
  });

  dbg(`normalizeRows: ${rows.length} rows kept, ${skipped} skipped (fatturato=0 AND qty=0)`);
  return rows;
}

// ─── Backwards-compat alias used by the UI ────────────────────────────────────
export function parseExcelToVarRows(raw: Record<string, unknown>[]): VarRow[] {
  return normalizeRows(raw);
}

// ─── Period / filter extraction ───────────────────────────────────────────────

export function toPeriodKey(anno: number, mese: number): string {
  return `${anno}-${String(mese).padStart(2, '0')}`;
}

export function periodLabel(anno: number, mese: number): string {
  return `${MONTH_NAMES[mese] ?? `M${mese}`} ${anno}`;
}

export function extractPeriods(rows: VarRow[]): PeriodKey[] {
  const seen = new Set<string>();
  const out: PeriodKey[] = [];
  for (const r of rows) {
    const k = toPeriodKey(r.anno, r.mese);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ anno: r.anno, mese: r.mese, key: k, label: periodLabel(r.anno, r.mese) });
    }
  }
  return out.sort((a, b) => a.anno !== b.anno ? a.anno - b.anno : a.mese - b.mese);
}

export function extractFilterOptions(rows: VarRow[]): FilterOptions {
  const sets: Record<FilterDim, Set<string>> = {
    brand: new Set(), categoria: new Set(), sottocategoria: new Set(),
    formato: new Set(), paese: new Set(), canale: new Set(),
  };
  for (const r of rows) {
    if (r.brand)          sets.brand.add(r.brand);
    if (r.categoria)      sets.categoria.add(r.categoria);
    if (r.sottocategoria) sets.sottocategoria.add(r.sottocategoria);
    if (r.formato)        sets.formato.add(r.formato);
    if (r.paese)          sets.paese.add(r.paese);
    if (r.canale)         sets.canale.add(r.canale);
  }
  const opts: FilterOptions = {
    brand: [], categoria: [], sottocategoria: [], formato: [], paese: [], canale: [],
  };
  for (const k of FILTER_DIMS) opts[k] = [...sets[k]].sort();
  return opts;
}

// ─── STEP 3: applyFilters — AND logic, pure function ─────────────────────────
// Rules:
// - Empty array for a dim = "include all" (filter not active)
// - All active dims must match (AND, not OR)
// - Comparison is case-sensitive (values come from the data itself)

export function applyFilters(
  rows: VarRow[],
  activeFilters: Partial<Record<FilterDim, string[]>>,
): VarRow[] {
  return rows.filter(r => {
    for (const dim of FILTER_DIMS) {
      const vals = activeFilters[dim];
      if (!vals || vals.length === 0) continue;  // filter not active for this dim
      const rv = (r[dim as keyof VarRow] as string) ?? '';
      if (!vals.includes(rv)) return false;
    }
    return true;
  });
}

// ─── STEP 4: splitPeriods — filter rows by period keys ───────────────────────

export function splitPeriods(rows: VarRow[], periodKeys: string[]): VarRow[] {
  const pSet = new Set(periodKeys);
  return rows.filter(r => pSet.has(toPeriodKey(r.anno, r.mese)));
}

// ─── Backwards-compat: used by UI component ──────────────────────────────────
export function filterRowsByPeriodAndFilters(
  rows: VarRow[],
  periodKeys: string[],
  activeFilters: Partial<Record<FilterDim, string[]>>,
): VarRow[] {
  const byPeriod = splitPeriods(rows, periodKeys);
  return applyFilters(byPeriod, activeFilters);
}

// ─── STEP 5: aggregatePeriod — group by codiceMateriale (primary key) ─────────
// Rule: margine % = sum(margine) / sum(fatturato), NOT the average of margine % per row.
// Primary key is always codiceMateriale — not categoria|||brand.

interface AggLine {
  codice: string;
  descrizione: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  q: number;
  rev: number;
  cost: number;
}

export function aggregatePeriod(rows: VarRow[]): Map<string, AggLine> {
  const map = new Map<string, AggLine>();

  for (const r of rows) {
    const k = r.codiceMateriale;  // PRIMARY KEY — never categoria|||brand
    if (!map.has(k)) {
      map.set(k, {
        codice: r.codiceMateriale,
        descrizione: r.descrizione,
        brand: r.brand,
        categoria: r.categoria,
        sottocategoria: r.sottocategoria,
        formato: r.formato,
        q: 0, rev: 0, cost: 0,
      });
    }
    const a = map.get(k)!;
    a.q    += r.quantita;
    a.rev  += r.fatturato;
    a.cost += r.costoTotale;
    // Keep first non-empty values for descriptive fields
    if (!a.brand          && r.brand)          a.brand          = r.brand;
    if (!a.categoria      && r.categoria)      a.categoria      = r.categoria;
    if (!a.sottocategoria && r.sottocategoria) a.sottocategoria = r.sottocategoria;
    if (!a.formato        && r.formato)        a.formato        = r.formato;
    if (!a.descrizione    && r.descrizione)    a.descrizione    = r.descrizione;
  }

  return map;
}

// ─── STEP 6: fullOuterJoinPeriods — union of all product keys ─────────────────
// Products only in P1: their delta lands in the volume/mix effect.
// Products only in P2: their delta lands in the volume/mix effect.
// Fallback prices/costs: price/cost effect = 0 for new/discontinued products.

export function fullOuterJoinPeriods(
  agg1: Map<string, AggLine>,
  agg2: Map<string, AggLine>,
): ComparedLine[] {
  const allKeys = new Set([...agg1.keys(), ...agg2.keys()]);
  const lines: ComparedLine[] = [];

  for (const key of allKeys) {
    const d1  = agg1.get(key);
    const d2  = agg2.get(key);
    const meta = (d1 ?? d2)!;

    const q1    = d1?.q    ?? 0;
    const rev1  = d1?.rev  ?? 0;
    const cost1 = d1?.cost ?? 0;
    const q2    = d2?.q    ?? 0;
    const rev2  = d2?.rev  ?? 0;
    const cost2 = d2?.cost ?? 0;

    // Fallback price/cost for new/discontinued products:
    // Price effect = 0 (price P1 = price P2 by fallback)
    // Cost effect  = 0 (cost  P1 = cost  P2 by fallback)
    // Delta goes entirely to volume/mix effect.
    const p1 = q1 > 0 ? rev1  / q1 : (q2 > 0 ? rev2  / q2 : null);
    const c1 = q1 > 0 ? cost1 / q1 : (q2 > 0 ? cost2 / q2 : null);
    const p2 = q2 > 0 ? rev2  / q2 : (q1 > 0 ? rev1  / q1 : null);
    const c2 = q2 > 0 ? cost2 / q2 : (q1 > 0 ? cost1 / q1 : null);

    const margin1    = rev1 - cost1;
    const margin2    = rev2 - cost2;
    const marginPct1 = rev1  > 0 ? margin1  / rev1  : null;
    const marginPct2 = rev2  > 0 ? margin2  / rev2  : null;

    lines.push({
      key,
      codice:       meta.codice,
      descrizione:  meta.descrizione,
      brand:        meta.brand,
      categoria:    meta.categoria,
      sottocategoria: meta.sottocategoria,
      formato:      meta.formato,
      q1, rev1, cost1, p1, c1, margin1, marginPct1,
      q2, rev2, cost2, p2, c2, margin2, marginPct2,
      deltaMargin:    margin2 - margin1,
      deltaMarginPct: marginPct1 !== null && marginPct2 !== null
        ? marginPct2 - marginPct1 : null,
      deltaRev: rev2 - rev1,
      isOnlyP1: !d2,
      isOnlyP2: !d1,
    });
  }

  return lines;
}

// ─── STEP 7: calculateBaseKpis ────────────────────────────────────────────────

interface BaseKpis {
  totalRev1: number;  totalRev2: number;
  totalCost1: number; totalCost2: number;
  totalMargin1: number; totalMargin2: number;
  marginPctP1: number; marginPctP2: number;
  Q1: number; Q2: number;
}

export function calculateBaseKpis(lines: ComparedLine[]): BaseKpis {
  const totalRev1   = lines.reduce((s, l) => s + l.rev1,   0);
  const totalRev2   = lines.reduce((s, l) => s + l.rev2,   0);
  const totalCost1  = lines.reduce((s, l) => s + l.cost1,  0);
  const totalCost2  = lines.reduce((s, l) => s + l.cost2,  0);
  const totalMargin1 = totalRev1 - totalCost1;
  const totalMargin2 = totalRev2 - totalCost2;
  const marginPctP1  = totalRev1  > 0 ? totalMargin1 / totalRev1  : 0;
  const marginPctP2  = totalRev2  > 0 ? totalMargin2 / totalRev2  : 0;
  const Q1 = lines.reduce((s, l) => s + l.q1, 0);
  const Q2 = lines.reduce((s, l) => s + l.q2, 0);
  return { totalRev1, totalRev2, totalCost1, totalCost2, totalMargin1, totalMargin2,
           marginPctP1, marginPctP2, Q1, Q2 };
}

// ─── STEP 8: calculateVarianceEffects ────────────────────────────────────────
// Four-scenario sequential decomposition on margin percentage (not €).
//
// Scenario V  — Q2 total, P1 mix, P1 prices, P1 costs
//   By construction effVolume ≈ 0 (same mix as P1, just scaled to Q2 volume)
//
// Scenario M  — actual Q2 quantities, P1 prices, P1 costs
//   effMix = marginPctM - marginPctV
//
// Scenario P  — actual Q2 quantities, P2 prices, P1 costs
//   effPrezzo = marginPctP - marginPctM
//
// Scenario C  — actual P2 (= actual Q2, P2 prices, P2 costs)
//   effCosto = marginPctP2 - marginPctP

export function calculateVarianceEffects(lines: ComparedLine[], kpis: BaseKpis): {
  effVolume: number;
  effMix: number;
  effPrezzo: number;
  effCosto: number;
  marginPctV: number;
  marginPctM: number;
  marginPctP: number;
} {
  const { marginPctP1, marginPctP2, totalRev2, Q1, Q2 } = kpis;

  // Scenario V: Q2_total × mix1_i, P1 prices, P1 costs
  let revV = 0, costV = 0;
  for (const l of lines) {
    const mix1 = Q1 > 0 ? l.q1 / Q1 : 0;
    const qV   = Q2 * mix1;
    revV  += qV * (l.p1 ?? 0);
    costV += qV * (l.c1 ?? 0);
  }
  const marginPctV = revV > 0 ? (revV - costV) / revV : marginPctP1;
  const effVolume  = marginPctV - marginPctP1;

  // Scenario M: actual q2_i, P1 prices, P1 costs
  let revM = 0, costM = 0;
  for (const l of lines) {
    revM  += l.q2 * (l.p1 ?? 0);
    costM += l.q2 * (l.c1 ?? 0);
  }
  const marginPctM = revM > 0 ? (revM - costM) / revM : marginPctV;
  const effMix     = marginPctM - marginPctV;

  // Scenario P: actual q2_i, P2 prices, P1 costs (revenue = actual P2)
  let costP = 0;
  for (const l of lines) costP += l.q2 * (l.c1 ?? 0);
  const marginPctP = totalRev2 > 0 ? (totalRev2 - costP) / totalRev2 : marginPctM;
  const effPrezzo  = marginPctP - marginPctM;

  // Scenario C = actual P2
  const effCosto = marginPctP2 - marginPctP;

  return { effVolume, effMix, effPrezzo, effCosto, marginPctV, marginPctM, marginPctP };
}

// ─── STEP 9: validateVarianceBridge ──────────────────────────────────────────

export function validateVarianceBridge(
  kpis: BaseKpis,
  effects: { effVolume: number; effMix: number; effPrezzo: number; effCosto: number },
): { expectedP2: number; quadratureDiff: number; isBalanced: boolean } {
  const expectedP2     = kpis.marginPctP1 + effects.effVolume + effects.effMix
                       + effects.effPrezzo + effects.effCosto;
  const quadratureDiff = kpis.marginPctP2 - expectedP2;
  const isBalanced     = Math.abs(quadratureDiff) <= 0.001;

  dbg('─── Quadrature check ───────────────────────────────────────────');
  dbg('marginPctP1 ', (kpis.marginPctP1  * 100).toFixed(4), '%');
  dbg('effVolume   ', (effects.effVolume * 100).toFixed(4), 'pp');
  dbg('effMix      ', (effects.effMix    * 100).toFixed(4), 'pp');
  dbg('effPrezzo   ', (effects.effPrezzo * 100).toFixed(4), 'pp');
  dbg('effCosto    ', (effects.effCosto  * 100).toFixed(4), 'pp');
  dbg('expectedP2  ', (expectedP2        * 100).toFixed(4), '%');
  dbg('marginPctP2 ', (kpis.marginPctP2  * 100).toFixed(4), '%');
  dbg('diff        ', (quadratureDiff    * 100).toFixed(4), 'pp', isBalanced ? '✓ OK' : '⚠ WARNING');
  dbg('────────────────────────────────────────────────────────────────');

  if (!isBalanced) {
    console.warn('[VARIANCE] Quadrature failed! diff =', (quadratureDiff * 100).toFixed(4), 'pp');
  }

  return { expectedP2, quadratureDiff, isBalanced };
}

// ─── Waterfall builders ───────────────────────────────────────────────────────

function buildCategoryWaterfall(
  lines: ComparedLine[],
  getV1: (l: ComparedLine) => number,
  getV2: (l: ComparedLine) => number,
  total1: number,
  total2: number,
  maxCats = 8,
): WaterfallPoint[] {
  const catContrib = new Map<string, number>();
  for (const l of lines) {
    const cat = l.categoria || l.brand || 'N/D';
    catContrib.set(cat, (catContrib.get(cat) ?? 0) + (getV2(l) - getV1(l)));
  }

  const sorted = [...catContrib.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top    = sorted.slice(0, maxCats);
  const rest   = sorted.slice(maxCats);
  if (rest.length > 0) {
    const s = rest.reduce((acc, [, v]) => acc + v, 0);
    if (Math.abs(s) > 0.01) top.push(['Altro', s]);
  }

  const pts: WaterfallPoint[] = [];
  let running = total1;

  pts.push({ name: 'P1', spacer: 0, total: total1, green: 0, red: 0, rawValue: total1, isTotal: true });

  for (const [cat, v] of top) {
    if (v >= 0) {
      pts.push({ name: cat, spacer: running, total: 0, green: v, red: 0, rawValue: v, isTotal: false });
    } else {
      pts.push({ name: cat, spacer: running + v, total: 0, green: 0, red: -v, rawValue: v, isTotal: false });
    }
    running += v;
  }

  pts.push({ name: 'P2', spacer: 0, total: total2, green: 0, red: 0, rawValue: total2, isTotal: true });
  return pts;
}

function buildEffectsWaterfall(
  pct1: number, effVol: number, effMix: number, effPr: number, effCo: number, pct2: number,
): WaterfallPoint[] {
  const pts: WaterfallPoint[] = [];
  let running = pct1 * 100;

  const addTotal = (name: string, v: number) => {
    pts.push({ name, spacer: 0, total: v, green: 0, red: 0, rawValue: v, isTotal: true });
    running = v;
  };
  const addEff = (name: string, v: number) => {
    const vp = v * 100;
    if (vp >= 0) {
      pts.push({ name, spacer: running, total: 0, green: vp, red: 0, rawValue: vp, isTotal: false });
    } else {
      pts.push({ name, spacer: running + vp, total: 0, green: 0, red: -vp, rawValue: vp, isTotal: false });
    }
    running += vp;
  };

  addTotal('P1', pct1 * 100);
  addEff('Volume', effVol);
  addEff('Mix', effMix);
  addEff('Prezzo', effPr);
  addEff('Costo', effCo);
  addTotal('P2', pct2 * 100);
  return pts;
}

// ─── Table groups (for UI table, grouped by brand × categoria) ────────────────

function buildTableGroups(lines: ComparedLine[]): TableGroup[] {
  const map = new Map<string, TableGroup>();

  for (const l of lines) {
    const gKey = [l.categoria, l.brand].filter(Boolean).join(' | ') || l.codice;
    if (!map.has(gKey)) {
      map.set(gKey, {
        key: gKey, brand: l.brand, categoria: l.categoria,
        sottocategoria: l.sottocategoria, formato: l.formato,
        rev1: 0, cost1: 0, margin1: 0, marginPct1: null,
        rev2: 0, cost2: 0, margin2: 0, marginPct2: null,
        effVolMix: null, effPrezzo: null, effCosto: null, effTotale: null,
        lines: [],
      });
    }
    const g = map.get(gKey)!;
    g.lines.push(l);
    g.rev1  += l.rev1;  g.cost1 += l.cost1;
    g.rev2  += l.rev2;  g.cost2 += l.cost2;
  }

  for (const g of map.values()) {
    g.margin1    = g.rev1 - g.cost1;
    g.margin2    = g.rev2 - g.cost2;
    g.marginPct1 = g.rev1 > 0 ? g.margin1 / g.rev1 : null;
    g.marginPct2 = g.rev2 > 0 ? g.margin2 / g.rev2 : null;

    if (g.marginPct1 !== null && g.marginPct2 !== null)
      g.effTotale = g.marginPct2 - g.marginPct1;

    // Scenario M at group level: Q2 actual, P1 prices/costs
    let revM = 0, costM = 0;
    for (const l of g.lines) { revM += l.q2 * (l.p1 ?? 0); costM += l.q2 * (l.c1 ?? 0); }
    const mM = revM > 0 ? (revM - costM) / revM : null;

    // Scenario P at group level: Q2 actual, P2 prices, P1 costs
    let revP = 0, costP = 0;
    for (const l of g.lines) { revP += l.q2 * (l.p2 ?? 0); costP += l.q2 * (l.c1 ?? 0); }
    const mP = revP > 0 ? (revP - costP) / revP : null;

    if (g.marginPct1 !== null && mM !== null) g.effVolMix = mM - g.marginPct1;
    if (mM !== null && mP !== null)           g.effPrezzo = mP - mM;
    if (mP !== null && g.marginPct2 !== null) g.effCosto  = g.marginPct2 - mP;
  }

  return [...map.values()].sort(
    (a, b) => Math.abs(b.margin2 - b.margin1) - Math.abs(a.margin2 - a.margin1),
  );
}

// ─── Formatters (for insight builder) ────────────────────────────────────────

function fmtE(v: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);
}

// ─── Main entry point ─────────────────────────────────────────────────────────
// Combines all steps: agg → join → kpis → effects → validation → output.

export function computeVarianceEffects(
  rowsP1: VarRow[],
  rowsP2: VarRow[],
): EffectsResult {
  // ── Step 5: aggregate by codiceMateriale ────────────────────────────────────
  const agg1 = aggregatePeriod(rowsP1);
  const agg2 = aggregatePeriod(rowsP2);

  dbg('P1 rows:', rowsP1.length, '→', agg1.size, 'referenze');
  dbg('P2 rows:', rowsP2.length, '→', agg2.size, 'referenze');

  const keysOnlyP1 = [...agg1.keys()].filter(k => !agg2.has(k));
  const keysOnlyP2 = [...agg2.keys()].filter(k => !agg1.has(k));
  const keysCommon  = [...agg1.keys()].filter(k =>  agg2.has(k));

  dbg('Keys only P1:', keysOnlyP1.length, keysOnlyP1.slice(0, 5));
  dbg('Keys only P2:', keysOnlyP2.length, keysOnlyP2.slice(0, 5));
  dbg('Keys common: ', keysCommon.length);

  // ── Step 6: full outer join ─────────────────────────────────────────────────
  const lines = fullOuterJoinPeriods(agg1, agg2);

  // ── Step 7: base KPIs ───────────────────────────────────────────────────────
  const kpis = calculateBaseKpis(lines);

  dbg('─── KPI P1 ───────────────────────────────────────────────────');
  dbg('Fatturato P1 :', fmtE(kpis.totalRev1));
  dbg('Costo P1     :', fmtE(kpis.totalCost1));
  dbg('Margine P1   :', fmtE(kpis.totalMargin1));
  dbg('Margine% P1  :', (kpis.marginPctP1 * 100).toFixed(4), '%');
  dbg('Q1           :', kpis.Q1.toFixed(2));
  dbg('─── KPI P2 ───────────────────────────────────────────────────');
  dbg('Fatturato P2 :', fmtE(kpis.totalRev2));
  dbg('Costo P2     :', fmtE(kpis.totalCost2));
  dbg('Margine P2   :', fmtE(kpis.totalMargin2));
  dbg('Margine% P2  :', (kpis.marginPctP2 * 100).toFixed(4), '%');
  dbg('Q2           :', kpis.Q2.toFixed(2));

  // Validate mix sums ≈ 1
  const sumMix1 = kpis.Q1 > 0 ? lines.reduce((s, l) => s + l.q1 / kpis.Q1, 0) : 0;
  const sumMix2 = kpis.Q2 > 0 ? lines.reduce((s, l) => s + l.q2 / kpis.Q2, 0) : 0;
  dbg('Sum mix1     :', sumMix1.toFixed(6), '(expected ≈ 1)');
  dbg('Sum mix2     :', sumMix2.toFixed(6), '(expected ≈ 1)');

  // ── Step 8: variance effects ────────────────────────────────────────────────
  const eff = calculateVarianceEffects(lines, kpis);

  // ── Step 9: quadrature validation ──────────────────────────────────────────
  const quad = validateVarianceBridge(kpis, eff);

  // ── Build table groups ──────────────────────────────────────────────────────
  const tableGroups = buildTableGroups(lines);

  // ── Waterfall data ──────────────────────────────────────────────────────────
  const waterfallRev    = buildCategoryWaterfall(
    lines, l => l.rev1, l => l.rev2, kpis.totalRev1, kpis.totalRev2,
  );
  const waterfallMargin = buildCategoryWaterfall(
    lines, l => l.margin1, l => l.margin2, kpis.totalMargin1, kpis.totalMargin2,
  );
  const waterfallMarginPct = buildEffectsWaterfall(
    kpis.marginPctP1, eff.effVolume, eff.effMix,
    eff.effPrezzo, eff.effCosto, kpis.marginPctP2,
  );

  // ── Top drivers ─────────────────────────────────────────────────────────────
  const withDelta    = lines.filter(l => l.deltaMarginPct !== null);
  const topVariations = [...withDelta]
    .sort((a, b) => Math.abs(b.deltaMarginPct!) - Math.abs(a.deltaMarginPct!)).slice(0, 3);
  const topBest  = [...withDelta]
    .filter(l => (l.deltaMarginPct ?? 0) > 0)
    .sort((a, b) => b.deltaMarginPct! - a.deltaMarginPct!).slice(0, 3);
  const topWorst = [...withDelta]
    .filter(l => (l.deltaMarginPct ?? 0) < 0)
    .sort((a, b) => a.deltaMarginPct! - b.deltaMarginPct!).slice(0, 3);

  return {
    totalRev1: kpis.totalRev1, totalRev2: kpis.totalRev2,
    totalCost1: kpis.totalCost1, totalCost2: kpis.totalCost2,
    totalMargin1: kpis.totalMargin1, totalMargin2: kpis.totalMargin2,
    marginPctP1: kpis.marginPctP1, marginPctP2: kpis.marginPctP2,
    effVolume: eff.effVolume, effMix: eff.effMix,
    effPrezzo: eff.effPrezzo, effCosto: eff.effCosto,
    expectedP2: quad.expectedP2,
    quadratureDiff: quad.quadratureDiff,
    isBalanced: quad.isBalanced,
    lines, tableGroups,
    waterfallRev, waterfallMargin, waterfallMarginPct,
    topVariations, topBest, topWorst,
  };
}

// ─── Deterministic AI insights ────────────────────────────────────────────────

export function generateInsights(e: EffectsResult): AIInsight[] {
  const revGrowth    = e.totalRev1 > 0 ? (e.totalRev2 - e.totalRev1) / e.totalRev1 * 100 : 0;
  const effPrPct     = e.effPrezzo * 100;
  const effCoPct     = e.effCosto  * 100;
  const marginGrowth = e.totalMargin1 !== 0
    ? (e.totalMargin2 - e.totalMargin1) / Math.abs(e.totalMargin1) * 100 : 0;
  const deltaMargPct = (e.marginPctP2 - e.marginPctP1) * 100;

  const pos = (n: number) => n >= 0 ? '+' : '';

  const insights: AIInsight[] = [];

  if (revGrowth > 10)
    insights.push({ title: 'Crescita Fatturato Significativa', type: 'positive',
      text: `Il fatturato è cresciuto del ${revGrowth.toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}), segnalando una forte espansione commerciale.` });
  else if (revGrowth > 0)
    insights.push({ title: 'Crescita Fatturato Moderata', type: 'positive',
      text: `Il fatturato registra una crescita contenuta del ${revGrowth.toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}).` });
  else
    insights.push({ title: 'Contrazione Fatturato', type: 'negative',
      text: `Il fatturato si è ridotto del ${Math.abs(revGrowth).toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}). Si raccomanda un'analisi dei volumi e del portafoglio.` });

  if (effPrPct > 2)
    insights.push({ title: 'Effetto Prezzo Positivo', type: 'positive',
      text: `L'effetto prezzo contribuisce con ${pos(effPrPct)}${effPrPct.toFixed(2)} pp alla marginalità.` });
  else if (effPrPct < -2)
    insights.push({ title: 'Pressione sui Prezzi di Vendita', type: 'negative',
      text: `L'effetto prezzo erode ${Math.abs(effPrPct).toFixed(2)} pp di marginalità.` });
  else
    insights.push({ title: 'Prezzi Sostanzialmente Stabili', type: 'neutral',
      text: `L'effetto prezzo è contenuto (${pos(effPrPct)}${effPrPct.toFixed(2)} pp).` });

  if (effCoPct > 2)
    insights.push({ title: 'Riduzione dei Costi di Acquisto', type: 'positive',
      text: `L'effetto costo apporta ${pos(effCoPct)}${effCoPct.toFixed(2)} pp alla marginalità.` });
  else if (effCoPct < -2)
    insights.push({ title: 'Incremento dei Costi di Acquisto', type: 'negative',
      text: `L'effetto costo comprime la marginalità di ${Math.abs(effCoPct).toFixed(2)} pp.` });
  else
    insights.push({ title: 'Costi di Acquisto Stabili', type: 'neutral',
      text: `L'effetto costo è marginale (${pos(effCoPct)}${effCoPct.toFixed(2)} pp).` });

  if (e.totalMargin2 >= e.totalMargin1)
    insights.push({ title: 'Creazione di Valore in Crescita', type: 'positive',
      text: `Il margine assoluto è cresciuto di ${fmtE(e.totalMargin2 - e.totalMargin1)} (+${marginGrowth.toFixed(1)}%), raggiungendo ${fmtE(e.totalMargin2)}.${deltaMargPct >= 0 ? '' : ` La marginalità % si riduce di ${Math.abs(deltaMargPct).toFixed(2)} pp.`}` });
  else
    insights.push({ title: 'Margine Assoluto in Contrazione', type: 'negative',
      text: `Il margine assoluto si è ridotto di ${fmtE(Math.abs(e.totalMargin2 - e.totalMargin1))} (${marginGrowth.toFixed(1)}%).` });

  return insights;
}
