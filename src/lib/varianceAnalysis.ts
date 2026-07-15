// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterDim = 'canale' | 'brand' | 'categoria' | 'sottocategoria' | 'formato';

export const FILTER_DIMS: FilterDim[] = [
  'canale', 'brand', 'categoria', 'sottocategoria', 'formato',
];

export const FILTER_DIM_LABELS: Record<FilterDim, string> = {
  canale: 'Canale',
  brand: 'Brand',
  categoria: 'Categoria',
  sottocategoria: 'Sottocategoria',
  formato: 'Formato',
};

export interface VarRow {
  codiceMateriale: string;
  descrizione: string;
  canale: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
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
  canale: string[];
  brand: string[];
  categoria: string[];
  sottocategoria: string[];
  formato: string[];
}

// ─── Technical flags per reference line ───────────────────────────────────────

export interface TechnicalFlags {
  newInP2: boolean;
  discontinuedInP2: boolean;
  priceFallback: boolean;
  costFallback: boolean;
  marginFallback: boolean;
}

// ─── ComparedLine = TechnicalRow ──────────────────────────────────────────────
// One row per referenceKey after full outer join.
// Raw fields: null when the period has no data (q=0).
// Effective fields: always numeric — fallback applied for calculation scenarios.
// p1/c1/p2/c2: backward-compat aliases pointing to raw values (null when absent).

export interface ComparedLine {
  // ── Identity ──────────────────────────────────────────────────────────────
  key: string;
  codice: string;
  descrizione: string;
  canale: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;

  // ── Presence ──────────────────────────────────────────────────────────────
  presence: 'both' | 'onlyP1' | 'onlyP2';
  isOnlyP1: boolean;
  isOnlyP2: boolean;

  // ── P1 aggregates ─────────────────────────────────────────────────────────
  q1: number;
  rev1: number;
  cost1: number;
  margin1: number;
  marginPct1Raw: number | null;   // null if rev1 = 0
  marginPct1: number | null;      // = marginPct1Raw (for display)

  // ── P1 unit rates ─────────────────────────────────────────────────────────
  price1Raw: number | null;         // null if q1 = 0
  unitCost1Raw: number | null;      // null if q1 = 0
  price1Effective: number;          // price1Raw ?? price2Raw ?? 0
  unitCost1Effective: number;       // unitCost1Raw ?? unitCost2Raw ?? 0

  // ── P2 aggregates ─────────────────────────────────────────────────────────
  q2: number;
  rev2: number;
  cost2: number;
  margin2: number;
  marginPct2Raw: number | null;
  marginPct2: number | null;

  // ── P2 unit rates ─────────────────────────────────────────────────────────
  price2Raw: number | null;
  unitCost2Raw: number | null;
  price2Effective: number;          // price2Raw ?? price1Raw ?? 0
  unitCost2Effective: number;       // unitCost2Raw ?? unitCost1Raw ?? 0

  // ── Mix shares (set after Q1/Q2 are known) ────────────────────────────────
  mix1: number;   // q1 / Q1
  mix2: number;   // q2 / Q2

  // ── Mix decomposition intermediate quantities (set by computeMixDecomposition) ──
  qMixCanale?:  number;   // Q2_canale        × (q1_i / Q1_canale)
  qMixBrand?:   number;   // Q2_canale_brand  × (q1_i / Q1_canale_brand)
  qMixCat?:     number;   // Q2_cbc           × (q1_i / Q1_cbc)
  qMixSubCat?:  number;   // Q2_cbcs          × (q1_i / Q1_cbcs)
  qMixFormato?: number;   // Q2_cbcsf         × (q1_i / Q1_cbcsf)

  // ── Backward-compat aliases (raw values, null when period absent) ─────────
  p1: number | null;
  c1: number | null;
  p2: number | null;
  c2: number | null;

  // ── Flags & warnings ──────────────────────────────────────────────────────
  flags: TechnicalFlags;
  warnings: string[];

  // ── Delta ─────────────────────────────────────────────────────────────────
  deltaMargin: number;
  deltaMarginPct: number | null;   // pp, null when one period has no revenue
  deltaRev: number;
}

export interface TableGroup {
  key: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  lineCount: number;
  presence: 'both' | 'onlyP1' | 'onlyP2' | 'mixed';
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
  // Intermediate scenario revenues (for exact additive mix decomposition)
  // totalRevM = Σ(q2_i × price1Effective_i): P2 quantities valued at P1 prices
  totalRevM: number;
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
  // Mix hierarchical decomposition
  mixDecomposition: MixDecomposition;
}

// One group's additive contribution to a sequential level's marginal effect (pp, decimal)
export interface MixLevelGroup {
  name: string;
  contribution: number; // pp (decimal) — sum over all groups = the level's effect
}

// Sequential hierarchical decomposition of effMix (all values in decimal pp, e.g. 0.023 = 2.3 pp)
// Hierarchy: Canale → Brand → Categoria → Sottocategoria → Formato → Residuo
export interface MixDecomposition {
  canale:         number;  // marginal effect of canale-level mix shift
  brand:          number;  // marginal effect of brand mix shift (given canale)
  categoria:      number;  // marginal effect of categoria mix shift (given canale+brand)
  sottocategoria: number;  // marginal effect of subcat mix shift (given canale+brand+cat)
  formato:        number;  // marginal effect of formato mix shift (given canale+brand+cat+subcat)
  residuo:        number;  // within-formato referenza-level residual
  totale:         number;  // = sum of above = effMix (verification, tolerance 0.001)
  // Per-group breakdown — each array is additive (sum = level's marginal effect)
  canaleBreakdown:          MixLevelGroup[];
  brandBreakdown:           MixLevelGroup[];
  categoriaBreakdown:       MixLevelGroup[];
  sottocategoriaBreakdown:  MixLevelGroup[];
  formatoBreakdown:         MixLevelGroup[];
  productBreakdown:         MixLevelGroup[];  // per referenza contribution to residuo
}

export interface AIInsight {
  title: string;
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}

// ─── Debug flag ────────────────────────────────────────────────────────────────
const DEBUG_VARIANCE = true;
function dbg(...args: unknown[]) {
  if (DEBUG_VARIANCE) console.log('[VARIANCE]', ...args);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

// ─── String normalizer ─────────────────────────────────────────────────────────

function normalizeStr(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFC');
}

// ─── parseNum — robust number parser ──────────────────────────────────────────
// Critical: XLSX.sheet_to_json returns numeric cells as JS numbers.
// Never convert a JS number to string — the dot-stripping logic would corrupt decimals.

export function parseNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;

  let s = String(v).replace(/[€\s]/g, '').trim();
  if (!s) return 0;

  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }

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
  costoUnitario: [
    'costo unitario/tariffa', 'costo unitario / tariffa',
    'costo unitario', 'tariffa', 'costo medio', 'unit cost', 'unitcost',
    'costo unit.', 'costo/unità', 'costo/unita', 'costo per unità', 'costo per pezzo',
  ],
  costoTotaleCol: [
    'costo totale', 'costi totali', 'total cost', 'costo', 'costi',
    'totale costi', 'costo variabile totale',
  ],
};

// ─── normalizeRows — parse Excel raw rows into VarRow[] ───────────────────────

export function normalizeRows(raw: Record<string, unknown>[]): VarRow[] {
  if (!raw.length) return [];
  const headers = Object.keys(raw[0]).map(h => String(h).trim());

  const cols: Partial<Record<string, string>> = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    cols[field] = findCol(headers, aliases);
  }

  dbg('Column mapping:', cols);
  dbg('Total raw rows:', raw.length);

  const hasCostoUnit = !!cols['costoUnitario'];
  const hasCostoTot  = !!cols['costoTotaleCol'];
  const useTotalCost = !hasCostoUnit && hasCostoTot;

  if (useTotalCost) dbg('WARNING: No unit cost column — using total cost column directly (NOT multiplied by qty).');
  if (!cols['fatturato'])       dbg('WARNING: No fatturato column found! KPIs will be wrong.');
  if (!cols['codiceMateriale']) dbg('WARNING: No product code column found. Using row index as key.');

  const get = (r: Record<string, unknown>, field: string) =>
    cols[field] ? r[cols[field]!] : undefined;

  const rows: VarRow[] = [];
  let skipped = 0;

  raw.forEach((r) => {
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

    if (fatturato === 0 && quantita === 0) { skipped++; return; }

    rows.push({
      codiceMateriale: String(get(r, 'codiceMateriale') ?? '').trim(),
      descrizione:     String(get(r, 'descrizione')     ?? '').trim(),
      brand:           String(get(r, 'brand')           ?? '').trim(),
      categoria:       String(get(r, 'categoria')       ?? '').trim(),
      sottocategoria:  String(get(r, 'sottocategoria')  ?? '').trim(),
      formato:         String(get(r, 'formato')         ?? '').trim(),
      canale:          String(get(r, 'canale')          ?? '').trim(),
      anno:            parseNum(get(r, 'anno')) || new Date().getFullYear(),
      mese:            parseMese(get(r, 'mese')),
      quantita,
      fatturato,
      costoUnitario,
      costoTotale,
    });
  });

  dbg(`normalizeRows: ${rows.length} rows kept, ${skipped} skipped`);
  return rows;
}

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
    canale: new Set(), brand: new Set(), categoria: new Set(),
    sottocategoria: new Set(), formato: new Set(),
  };
  for (const r of rows) {
    if (r.canale)         sets.canale.add(r.canale);
    if (r.brand)          sets.brand.add(r.brand);
    if (r.categoria)      sets.categoria.add(r.categoria);
    if (r.sottocategoria) sets.sottocategoria.add(r.sottocategoria);
    if (r.formato)        sets.formato.add(r.formato);
  }
  const opts: FilterOptions = {
    canale: [], brand: [], categoria: [], sottocategoria: [], formato: [],
  };
  for (const k of FILTER_DIMS) opts[k] = [...sets[k]].sort();
  return opts;
}

// ─── applyFilters — AND logic ─────────────────────────────────────────────────
// Empty array for a dim = "include all". All active dims must match (AND, not OR).

export function applyFilters(
  rows: VarRow[],
  activeFilters: Partial<Record<FilterDim, string[]>>,
): VarRow[] {
  return rows.filter(r => {
    for (const dim of FILTER_DIMS) {
      const vals = activeFilters[dim];
      if (!vals || vals.length === 0) continue;
      const rv = (r[dim as keyof VarRow] as string) ?? '';
      if (!vals.includes(rv)) return false;
    }
    return true;
  });
}

export function splitPeriods(rows: VarRow[], periodKeys: string[]): VarRow[] {
  const pSet = new Set(periodKeys);
  return rows.filter(r => pSet.has(toPeriodKey(r.anno, r.mese)));
}

export function filterRowsByPeriodAndFilters(
  rows: VarRow[],
  periodKeys: string[],
  activeFilters: Partial<Record<FilterDim, string[]>>,
): VarRow[] {
  return applyFilters(splitPeriods(rows, periodKeys), activeFilters);
}

// ─── buildReferenceKeyFn ──────────────────────────────────────────────────────
// Scans the combined P1+P2 dataset (post-filter) to build the most granular key
// that still uniquely identifies each product across both periods.
//
// Resolution order:
//   1. code alone (if code maps to one distinct description)
//   2. code | description (if code is ambiguous)
//   3. code | description | categoria | sottocategoria
//      (if the same code+description appears with different categorical attributes)
//
// Step 3 is critical when "Codice Materiale" is non-unique (e.g. a brand name)
// and "Descrizione Materiale" is a size — the same (brand, size) can belong to
// completely different subcategories that must NOT be aggregated together.

function buildReferenceKeyFn(allRows: VarRow[]): (row: VarRow) => string {
  // Step 1: code → set of descriptions
  const codeToDescs = new Map<string, Set<string>>();
  for (const r of allRows) {
    const code = normalizeStr(r.codiceMateriale);
    if (code) {
      if (!codeToDescs.has(code)) codeToDescs.set(code, new Set());
      codeToDescs.get(code)!.add(normalizeStr(r.descrizione));
    }
  }

  // Step 2: (code|desc) → set of (brand, categoria, sottocategoria) tuples
  // Detects when the same code+description key refers to multiple distinct products.
  const compositeToAttrs = new Map<string, Set<string>>();
  for (const r of allRows) {
    const code = normalizeStr(r.codiceMateriale);
    const descs = codeToDescs.get(code);
    const codeUnique = !descs || descs.size <= 1;
    const trimCode = r.codiceMateriale.trim();
    const trimDesc = r.descrizione.trim();
    const baseKey = codeUnique ? trimCode : (trimDesc ? `${trimCode} | ${trimDesc}` : trimCode);
    const attrKey = `${r.brand}§${r.categoria}§${r.sottocategoria}`;
    if (!compositeToAttrs.has(baseKey)) compositeToAttrs.set(baseKey, new Set());
    compositeToAttrs.get(baseKey)!.add(attrKey);
  }

  return (row: VarRow): string => {
    const code = row.codiceMateriale.trim();
    const desc = row.descrizione.trim();
    if (!code) return desc || '_unknown_';

    const descs = codeToDescs.get(normalizeStr(code));
    const codeUnique = !descs || descs.size <= 1;
    const baseKey = codeUnique ? code : (desc ? `${code} | ${desc}` : code);

    // If baseKey is still ambiguous, extend with categorical dimensions
    const attrSets = compositeToAttrs.get(baseKey);
    if (attrSets && attrSets.size > 1) {
      const dims = [row.categoria, row.sottocategoria].filter(Boolean).join(' | ');
      return dims ? `${baseKey} | ${dims}` : baseKey;
    }

    return baseKey;
  };
}

// ─── aggregatePeriod — group by referenceKey ──────────────────────────────────
// margine % = sum(margine) / sum(fatturato), NOT average of row-level margin %.

interface AggLine {
  codice: string;
  descrizione: string;
  canale: string;
  brand: string;
  categoria: string;
  sottocategoria: string;
  formato: string;
  q: number;
  rev: number;
  cost: number;
}

export function aggregatePeriod(
  rows: VarRow[],
  getKey: (row: VarRow) => string = (r) => r.codiceMateriale || r.descrizione || '_unknown_',
): Map<string, AggLine> {
  const map = new Map<string, AggLine>();

  for (const r of rows) {
    const k = getKey(r);
    if (!map.has(k)) {
      map.set(k, {
        codice: r.codiceMateriale,
        descrizione: r.descrizione,
        canale: r.canale,
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
    if (!a.brand          && r.brand)          a.brand          = r.brand;
    if (!a.categoria      && r.categoria)      a.categoria      = r.categoria;
    if (!a.sottocategoria && r.sottocategoria) a.sottocategoria = r.sottocategoria;
    if (!a.formato        && r.formato)        a.formato        = r.formato;
    if (!a.descrizione    && r.descrizione)    a.descrizione    = r.descrizione;
    if (!a.canale         && r.canale)         a.canale         = r.canale;
  }

  return map;
}

// ─── fullOuterJoinPeriods ─────────────────────────────────────────────────────
// Union of all referenceKeys from P1 and P2.
// onlyP1 products: fallback price2/cost2Effective = price1Raw/unitCost1Raw → effPrezzo=0, effCosto=0.
// onlyP2 products: fallback price1/cost1Effective = price2Raw/unitCost2Raw → effPrezzo=0, effCosto=0.
// All impact for new/discontinued products lands in effMix.

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

    // ── Raw unit rates: null when the period has no quantity ─────────────────
    const price1Raw:    number | null = q1 > 0 ? rev1  / q1 : null;
    const unitCost1Raw: number | null = q1 > 0 ? cost1 / q1 : null;
    const price2Raw:    number | null = q2 > 0 ? rev2  / q2 : null;
    const unitCost2Raw: number | null = q2 > 0 ? cost2 / q2 : null;

    // ── Effective unit rates: fallback cross-period ───────────────────────────
    // For onlyP2: price1Effective = price2Raw  → Scenario V contributes 0 (mix1=0)
    //             but Scenario M uses q2×price1Effective = q2×price2, giving correct margin
    // For onlyP1: price2Effective = price1Raw  → effPrezzo=0, effCosto=0 for this line
    const price1Effective:    number = price1Raw    ?? price2Raw    ?? 0;
    const unitCost1Effective: number = unitCost1Raw ?? unitCost2Raw ?? 0;
    const price2Effective:    number = price2Raw    ?? price1Raw    ?? 0;
    const unitCost2Effective: number = unitCost2Raw ?? unitCost1Raw ?? 0;

    const priceFallback = (price1Raw === null && price2Raw !== null) ||
                          (price2Raw === null && price1Raw !== null);
    const costFallback  = (unitCost1Raw === null && unitCost2Raw !== null) ||
                          (unitCost2Raw === null && unitCost1Raw !== null);

    // ── Margin aggregates ─────────────────────────────────────────────────────
    const margin1    = rev1 - cost1;
    const margin2    = rev2 - cost2;
    const marginPct1Raw: number | null = rev1 > 0 ? margin1 / rev1 : null;
    const marginPct2Raw: number | null = rev2 > 0 ? margin2 / rev2 : null;

    // ── Presence ──────────────────────────────────────────────────────────────
    const presence: 'both' | 'onlyP1' | 'onlyP2' =
      !d1 ? 'onlyP2' : !d2 ? 'onlyP1' : 'both';

    const warnings: string[] = [];
    if (priceFallback) warnings.push(`price fallback applied (${presence})`);
    if (costFallback)  warnings.push(`cost fallback applied (${presence})`);

    lines.push({
      key,
      codice:        meta.codice,
      descrizione:   meta.descrizione,
      canale:        meta.canale,
      brand:         meta.brand,
      categoria:     meta.categoria,
      sottocategoria: meta.sottocategoria,
      formato:       meta.formato,

      presence,
      isOnlyP1: presence === 'onlyP1',
      isOnlyP2: presence === 'onlyP2',

      q1, rev1, cost1, margin1,
      marginPct1Raw, marginPct1: marginPct1Raw,
      price1Raw, unitCost1Raw, price1Effective, unitCost1Effective,

      q2, rev2, cost2, margin2,
      marginPct2Raw, marginPct2: marginPct2Raw,
      price2Raw, unitCost2Raw, price2Effective, unitCost2Effective,

      // Mix shares initialised to 0; set after Q1/Q2 known
      mix1: 0,
      mix2: 0,

      // Backward-compat: raw values (null = no data for that period)
      p1: price1Raw,
      c1: unitCost1Raw,
      p2: price2Raw,
      c2: unitCost2Raw,

      flags: {
        newInP2:         presence === 'onlyP2',
        discontinuedInP2: presence === 'onlyP1',
        priceFallback,
        costFallback,
        marginFallback:  false,
      },
      warnings,

      deltaMargin:    margin2 - margin1,
      deltaMarginPct: marginPct1Raw !== null && marginPct2Raw !== null
        ? marginPct2Raw - marginPct1Raw : null,
      deltaRev: rev2 - rev1,
    });
  }

  return lines;
}

// ─── enrichWithMix — set mix1/mix2 once Q1/Q2 are known ──────────────────────

function enrichWithMix(lines: ComparedLine[], Q1: number, Q2: number): void {
  for (const l of lines) {
    l.mix1 = Q1 > 0 ? l.q1 / Q1 : 0;
    l.mix2 = Q2 > 0 ? l.q2 / Q2 : 0;
  }
}

// ─── calculateBaseKpis ────────────────────────────────────────────────────────

interface BaseKpis {
  totalRev1: number;  totalRev2: number;
  totalCost1: number; totalCost2: number;
  totalMargin1: number; totalMargin2: number;
  marginPctP1: number; marginPctP2: number;
  Q1: number; Q2: number;
}

export function calculateBaseKpis(lines: ComparedLine[]): BaseKpis {
  const totalRev1    = lines.reduce((s, l) => s + l.rev1,   0);
  const totalRev2    = lines.reduce((s, l) => s + l.rev2,   0);
  const totalCost1   = lines.reduce((s, l) => s + l.cost1,  0);
  const totalCost2   = lines.reduce((s, l) => s + l.cost2,  0);
  const totalMargin1 = totalRev1 - totalCost1;
  const totalMargin2 = totalRev2 - totalCost2;
  const marginPctP1  = totalRev1 > 0 ? totalMargin1 / totalRev1 : 0;
  const marginPctP2  = totalRev2 > 0 ? totalMargin2 / totalRev2 : 0;
  const Q1 = lines.reduce((s, l) => s + l.q1, 0);
  const Q2 = lines.reduce((s, l) => s + l.q2, 0);
  return { totalRev1, totalRev2, totalCost1, totalCost2,
           totalMargin1, totalMargin2, marginPctP1, marginPctP2, Q1, Q2 };
}

// ─── calculateVarianceEffects ─────────────────────────────────────────────────
// Sequential 4-scenario decomposition on margin percentage (not €).
//
// Scenario V — Q2 total, P1 mix, P1 prices, P1 costs  → effVolume ≈ 0
// Scenario M — actual Q2 quantities, P1 prices, P1 costs → effMix
// Scenario P — actual Q2 quantities, P2 prices, P1 costs → effPrezzo
// Scenario C — actual P2 (= actual Q2, P2 prices, P2 costs) → effCosto
//
// All scenarios use price_Effective / unitCost_Effective so that
// onlyP1/onlyP2 products generate effPrezzo = 0 and effCosto = 0,
// with their full impact landing in effMix.

export function calculateVarianceEffects(lines: ComparedLine[], kpis: BaseKpis): {
  effVolume: number;
  effMix: number;
  effPrezzo: number;
  effCosto: number;
  marginPctV: number;
  marginPctM: number;
  marginPctP: number;
  totalRevM: number;
} {
  const { marginPctP1, marginPctP2, totalRev2, Q1, Q2 } = kpis;

  // Scenario V: Q2_total × mix1_i, P1 effective prices, P1 effective costs
  // onlyP2: mix1 = 0 → no contribution (correct: new product cannot affect volume)
  let revV = 0, costV = 0;
  for (const l of lines) {
    const mix1 = Q1 > 0 ? l.q1 / Q1 : 0;
    const qV   = Q2 * mix1;
    revV  += qV * l.price1Effective;
    costV += qV * l.unitCost1Effective;
  }
  const marginPctV = revV > 0 ? (revV - costV) / revV : marginPctP1;
  const effVolume  = marginPctV - marginPctP1;

  // Scenario M: actual q2_i quantities × P1 effective prices/costs for ALL products.
  // onlyP2: price1Effective = price2Raw (fallback) → effPrezzo = 0 for them → their
  // entire margin contribution lands in effMix, per Alessio's spec: "un codice non
  // presente in uno dei due periodi → variazione integralmente sull'effetto mix."
  // onlyP1: q2 = 0 → contribute 0 naturally.
  let revM = 0, costM = 0;
  for (const l of lines) {
    revM  += l.q2 * l.price1Effective;
    costM += l.q2 * l.unitCost1Effective;
  }
  const marginPctM = revM > 0 ? (revM - costM) / revM : marginPctV;
  const effMix     = marginPctM - marginPctV;

  // Scenario P: actual q2_i, P2 effective prices, P1 effective costs
  // sum(q2_i × price2Effective_i) = totalRev2 exactly (price2Effective = rev2/q2 or 0)
  let costP = 0;
  for (const l of lines) costP += l.q2 * l.unitCost1Effective;
  const marginPctP = totalRev2 > 0 ? (totalRev2 - costP) / totalRev2 : marginPctM;
  const effPrezzo  = marginPctP - marginPctM;

  // Scenario C = actual P2
  const effCosto = marginPctP2 - marginPctP;

  return { effVolume, effMix, effPrezzo, effCosto, marginPctV, marginPctM, marginPctP, totalRevM: revM };
}

// ─── validateVarianceBridge ───────────────────────────────────────────────────

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
  maxCats = 4,
): WaterfallPoint[] {
  const catContrib = new Map<string, number>();
  for (const l of lines) {
    const cat = l.categoria || l.brand || 'N/D';
    catContrib.set(cat, (catContrib.get(cat) ?? 0) + (getV2(l) - getV1(l)));
  }

  const sorted = [...catContrib.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top    = sorted.slice(0, maxCats);

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

// ─── buildTableGroups — rollup after reference-level calculation ───────────────
// Group key: brand | categoria (both available) or whichever is present.
// Group-level effects use price_Effective for consistency with global effects.

function buildTableGroups(lines: ComparedLine[]): TableGroup[] {
  const map = new Map<string, TableGroup>();

  for (const l of lines) {
    // Consistent group key: brand | categoria
    const gKey = l.brand && l.categoria
      ? `${l.brand} | ${l.categoria}`
      : l.brand || l.categoria || l.codice;

    if (!map.has(gKey)) {
      map.set(gKey, {
        key: gKey, brand: l.brand, categoria: l.categoria,
        sottocategoria: l.sottocategoria, formato: l.formato,
        lineCount: 0,
        presence: l.presence,
        rev1: 0, cost1: 0, margin1: 0, marginPct1: null,
        rev2: 0, cost2: 0, margin2: 0, marginPct2: null,
        effVolMix: null, effPrezzo: null, effCosto: null, effTotale: null,
        lines: [],
      });
    }
    const g = map.get(gKey)!;
    g.lines.push(l);
    g.lineCount++;
    g.rev1  += l.rev1;  g.cost1 += l.cost1;
    g.rev2  += l.rev2;  g.cost2 += l.cost2;
  }

  for (const g of map.values()) {
    // ── Aggregate margin from sums, not average of % ──────────────────────────
    g.margin1    = g.rev1 - g.cost1;
    g.margin2    = g.rev2 - g.cost2;
    g.marginPct1 = g.rev1 > 0 ? g.margin1 / g.rev1 : null;
    g.marginPct2 = g.rev2 > 0 ? g.margin2 / g.rev2 : null;

    if (g.marginPct1 !== null && g.marginPct2 !== null)
      g.effTotale = g.marginPct2 - g.marginPct1;

    // ── Presence of the group ────────────────────────────────────────────────
    const presences = new Set(g.lines.map(l => l.presence));
    if (presences.size === 1) {
      g.presence = [...presences][0] as 'both' | 'onlyP1' | 'onlyP2';
    } else {
      g.presence = 'mixed';
    }

    // ── Group-level effects (approximate, for display only) ───────────────────
    // Uses price_Effective to be consistent with global calculation.
    // Scenario M at group level: actual q2, P1 effective prices/costs
    let revM = 0, costM = 0;
    for (const l of g.lines) {
      revM  += l.q2 * l.price1Effective;
      costM += l.q2 * l.unitCost1Effective;
    }
    const mM = revM > 0 ? (revM - costM) / revM : null;

    // Scenario P at group level: actual q2, P2 effective prices, P1 effective costs
    let revP = 0, costP = 0;
    for (const l of g.lines) {
      revP  += l.q2 * l.price2Effective;
      costP += l.q2 * l.unitCost1Effective;
    }
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

// ─── computeMixDecomposition — sequential hierarchical decomposition of effMix ──
//
// Decomposes effMix = marginPctM − marginPctV into marginal contributions by
// hierarchy level: Brand → Categoria → Sottocategoria → Formato → Residuo.
//
// Each step builds a "hybrid" scenario where the group-level quantities match
// the actual P2 totals, but within each group lines are distributed in P1
// proportions. The difference between consecutive scenarios is the marginal
// effect of adding one more dimension of granularity.
//
// Telescoping identity (always exact):
//   effMixBrand + effMixCat + effMixSubCat + effMixFormato + residuo = effMix
//
// Fallback: if a group has Q1 = 0 (all lines are onlyP2), within-group
// distribution uses q2 proportions (which simplifies to qS = q2_i), so
// the brand contributes its full actual q2 effect instead of 0.
//
// Side-effect: mutates lines to store intermediate quantities qMixBrand/Cat/SubCat/Formato.

function computeMixDecomposition(
  lines: ComparedLine[],
  marginPctV: number,
  marginPctM: number,
): MixDecomposition {
  const effMixTotal = marginPctM - marginPctV;

  const Q2 = lines.reduce((s, l) => s + l.q2, 0);

  // Original buildScenario formula: distribute Q2g in P1 proportions within each group.
  // Fallback to q2_i when Q1g = 0 (group absent from P1) OR when the optional
  // ancestor check fails (an ancestor group is absent from P1).
  // Returns groupQ1/groupQ2 so each level can pass them as ancestor checks downstream.
  function buildScenario(
    groupKey:  (l: ComparedLine) => string,
    setter:    (l: ComparedLine, q: number) => void,
    ancestors?: (l: ComparedLine) => boolean,
  ): { marginPct: number; groupQ1: Map<string, number>; groupQ2: Map<string, number> } {
    const groupQ1 = new Map<string, number>();
    const groupQ2 = new Map<string, number>();
    for (const l of lines) {
      const k = groupKey(l);
      groupQ1.set(k, (groupQ1.get(k) ?? 0) + l.q1);
      groupQ2.set(k, (groupQ2.get(k) ?? 0) + l.q2);
    }
    let revS = 0, costS = 0;
    for (const l of lines) {
      const k   = groupKey(l);
      const Q1g = groupQ1.get(k) ?? 0;
      const Q2g = groupQ2.get(k) ?? 0;
      const qS  = (Q1g > 0 && (!ancestors || ancestors(l))) ? Q2g * (l.q1 / Q1g) : l.q2;
      setter(l, qS);
      revS  += qS * l.price1Effective;
      costS += qS * l.unitCost1Effective;
    }
    return { marginPct: revS > 0 ? (revS - costS) / revS : marginPctV, groupQ1, groupQ2 };
  }

  // Level 0: Canale — no ancestor check
  const resCanale = buildScenario(
    l => l.canale || 'N/D',
    (l, q) => { l.qMixCanale = q; },
  );
  const mpctCanale = resCanale.marginPct;

  // Level 1: Brand (within Canale) — require Q1_canale > 0
  const resBrand = buildScenario(
    l => `${l.canale || 'N/D'}|${l.brand || 'N/D'}`,
    (l, q) => { l.qMixBrand = q; },
    l => (resCanale.groupQ1.get(l.canale || 'N/D') ?? 0) > 0,
  );
  const mpctBrand = resBrand.marginPct;

  // Level 2: Categoria (within Canale+Brand) — require Q1_cb > 0 and Q1_canale > 0
  const resCat = buildScenario(
    l => `${l.canale || 'N/D'}|${l.brand || 'N/D'}|${l.categoria || 'N/D'}`,
    (l, q) => { l.qMixCat = q; },
    l => {
      const cb = `${l.canale || 'N/D'}|${l.brand || 'N/D'}`;
      return (resBrand.groupQ1.get(cb) ?? 0) > 0 && (resCanale.groupQ1.get(l.canale || 'N/D') ?? 0) > 0;
    },
  );
  const mpctCat = resCat.marginPct;

  // Level 3: SubCat (within Canale+Brand+Cat)
  const resSubCat = buildScenario(
    l => `${l.canale || 'N/D'}|${l.brand || 'N/D'}|${l.categoria || 'N/D'}|${l.sottocategoria || 'N/D'}`,
    (l, q) => { l.qMixSubCat = q; },
    l => {
      const c   = l.canale || 'N/D';
      const cb  = `${c}|${l.brand || 'N/D'}`;
      const cbc = `${cb}|${l.categoria || 'N/D'}`;
      return (resCat.groupQ1.get(cbc) ?? 0) > 0
          && (resBrand.groupQ1.get(cb) ?? 0) > 0
          && (resCanale.groupQ1.get(c) ?? 0) > 0;
    },
  );
  const mpctSubCat = resSubCat.marginPct;

  // Level 4: Formato (within Canale+Brand+Cat+SubCat)
  const resFormato = buildScenario(
    l => `${l.canale || 'N/D'}|${l.brand || 'N/D'}|${l.categoria || 'N/D'}|${l.sottocategoria || 'N/D'}|${l.formato || 'N/D'}`,
    (l, q) => { l.qMixFormato = q; },
    l => {
      const c    = l.canale || 'N/D';
      const cb   = `${c}|${l.brand || 'N/D'}`;
      const cbc  = `${cb}|${l.categoria || 'N/D'}`;
      const cbcs = `${cbc}|${l.sottocategoria || 'N/D'}`;
      return (resSubCat.groupQ1.get(cbcs) ?? 0) > 0
          && (resCat.groupQ1.get(cbc) ?? 0) > 0
          && (resBrand.groupQ1.get(cb) ?? 0) > 0
          && (resCanale.groupQ1.get(c) ?? 0) > 0;
    },
  );
  const mpctFormato = resFormato.marginPct;

  const canale        = mpctCanale  - marginPctV;
  const brand         = mpctBrand   - mpctCanale;
  const categoria     = mpctCat     - mpctBrand;
  const sottocategoria = mpctSubCat - mpctCat;
  const formato       = mpctFormato - mpctSubCat;
  const residuo       = marginPctM  - mpctFormato;
  const totale        = canale + brand + categoria + sottocategoria + formato + residuo;
  const balanceErr    = Math.abs(totale - effMixTotal);

  dbg('─── mixDecomposition ──────────────────────────────────────────');
  dbg('canale        ', (canale         * 100).toFixed(4), 'pp');
  dbg('brand         ', (brand          * 100).toFixed(4), 'pp');
  dbg('categoria     ', (categoria      * 100).toFixed(4), 'pp');
  dbg('sottocategoria', (sottocategoria * 100).toFixed(4), 'pp');
  dbg('formato       ', (formato        * 100).toFixed(4), 'pp');
  dbg('residuo       ', (residuo        * 100).toFixed(4), 'pp');
  dbg('totale        ', (totale         * 100).toFixed(4), 'pp  (effMix =', (effMixTotal * 100).toFixed(4), ')');

  if (balanceErr > 0.001) {
    console.warn('[VARIANCE] mixDecomposition quadrature FAILED — balance error:',
      (balanceErr * 100).toFixed(6), 'pp',
      { canale, brand, categoria, sottocategoria, formato, residuo, totale, effMixTotal });
  } else {
    dbg('quadrature ✓ — balance error:', (balanceErr * 100).toFixed(6), 'pp');
  }
  dbg('────────────────────────────────────────────────────────────────');

  // ── Per-group additive breakdown for each hierarchical level ─────────────

  function levelBreakdown(
    keyFn: (l: ComparedLine) => string,
    getQBefore: (l: ComparedLine) => number,
    getQAfter:  (l: ComparedLine) => number,
  ): MixLevelGroup[] {
    let revBefore = 0, costBefore = 0, revAfter = 0, costAfter = 0;
    for (const l of lines) {
      const qB = getQBefore(l);
      const qA = getQAfter(l);
      revBefore  += qB * l.price1Effective;
      costBefore += qB * l.unitCost1Effective;
      revAfter   += qA * l.price1Effective;
      costAfter  += qA * l.unitCost1Effective;
    }
    const map = new Map<string, { rb: number; cb: number; ra: number; ca: number }>();
    for (const l of lines) {
      const k = keyFn(l);
      if (!map.has(k)) map.set(k, { rb: 0, cb: 0, ra: 0, ca: 0 });
      const g = map.get(k)!;
      g.rb += getQBefore(l) * l.price1Effective;
      g.cb += getQBefore(l) * l.unitCost1Effective;
      g.ra += getQAfter(l)  * l.price1Effective;
      g.ca += getQAfter(l)  * l.unitCost1Effective;
    }
    const result: MixLevelGroup[] = [];
    for (const [name, g] of map.entries()) {
      const mBefore = revBefore > 0 ? (g.rb - g.cb) / revBefore : 0;
      const mAfter  = revAfter  > 0 ? (g.ra - g.ca) / revAfter  : 0;
      result.push({ name, contribution: mAfter - mBefore });
    }
    return result.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }

  const canaleBreakdown = levelBreakdown(
    l => l.canale || 'N/D',
    l => Q2 * l.mix1,
    l => l.qMixCanale ?? 0,
  );
  const brandBreakdown = levelBreakdown(
    l => `${l.canale || 'N/D'} › ${l.brand || 'N/D'}`,
    l => l.qMixCanale ?? 0,
    l => l.qMixBrand ?? 0,
  );
  const categoriaBreakdown = levelBreakdown(
    l => `${l.canale || 'N/D'} › ${l.brand || 'N/D'} › ${l.categoria || 'N/D'}`,
    l => l.qMixBrand ?? 0,
    l => l.qMixCat ?? 0,
  );
  const sottocategoriaBreakdown = levelBreakdown(
    l => `${l.canale || 'N/D'} › ${l.brand || 'N/D'} › ${l.categoria || 'N/D'} › ${l.sottocategoria || 'N/D'}`,
    l => l.qMixCat ?? 0,
    l => l.qMixSubCat ?? 0,
  );
  const formatoBreakdown = levelBreakdown(
    l => `${l.canale || 'N/D'} › ${l.brand || 'N/D'} › ${l.categoria || 'N/D'} › ${l.sottocategoria || 'N/D'} › ${l.formato || 'N/D'}`,
    l => l.qMixSubCat ?? 0,
    l => l.qMixFormato ?? 0,
  );
  const productBreakdown = levelBreakdown(
    l => l.descrizione || l.codice || l.key,
    l => l.qMixFormato ?? 0,
    l => l.q2,
  );

  return {
    canale, brand, categoria, sottocategoria, formato, residuo, totale,
    canaleBreakdown, brandBreakdown, categoriaBreakdown, sottocategoriaBreakdown, formatoBreakdown, productBreakdown,
  };
}

// ─── computeGroupBridge ──────────────────────────────────────────────────────
// Computes the sequential bridge for an arbitrary subset of ComparedLine[].
// Mix is split into three sequential levels (Brand → Categoria → Sottocategoria)
// plus a residual that captures formato and referenza effects:
//   effMixBrand          – brand mix shift
//   effMixCategoria      – categoria shift within brand
//   effMixSottocategoria – subcat shift within brand+categoria
//   effMixReferenza      – residual (formato + referenza effects)

export interface GroupBridgeResult {
  cosP1:                number | null;
  cosP2:                number | null;
  effVolume:            number;
  effMixBrand:          number;  // Level 1: brand mix within group (≈0 for single-brand subsets)
  effMixCategoria:      number;  // Level 2: categoria mix within brand
  effMixSottocategoria: number;  // Level 3: subcat mix within brand+categoria
  effMixReferenza:      number;  // Residual: everything below subcat (includes formato)
  effPrezzo:            number;
  effCosto:             number;
  presence: 'both' | 'onlyP1' | 'onlyP2' | 'mixed';
}

export function computeGroupBridge(lines: ComparedLine[]): GroupBridgeResult {
  if (!lines.length) {
    return { cosP1: null, cosP2: null, effVolume: 0,
             effMixBrand: 0, effMixCategoria: 0, effMixSottocategoria: 0, effMixReferenza: 0,
             effPrezzo: 0, effCosto: 0, presence: 'both' };
  }
  const kpis = calculateBaseKpis(lines);

  const presSet = new Set(lines.map(l => l.presence));
  const presence = presSet.size === 1
    ? ([...presSet][0] as 'both' | 'onlyP1' | 'onlyP2')
    : 'mixed' as const;

  // Pure P1-only or P2-only groups: no meaningful bridge, all effects = 0.
  // Convention (matches Alessio): show the available period's margin as BOTH cosP1 and cosP2
  // so the row appears "unchanged" (zero delta, all effects zero).
  if (kpis.totalRev1 === 0 || kpis.totalRev2 === 0) {
    const cosP1 = kpis.totalRev1 > 0 ? kpis.marginPctP1 : kpis.marginPctP2;
    const cosP2 = kpis.totalRev2 > 0 ? kpis.marginPctP2 : kpis.marginPctP1;
    return {
      cosP1, cosP2,
      effVolume: 0, effMixBrand: 0, effMixCategoria: 0, effMixSottocategoria: 0,
      effMixReferenza: 0, effPrezzo: 0, effCosto: 0,
      presence,
    };
  }

  const eff = calculateVarianceEffects(lines, kpis);
  const { marginPctV } = eff;

  // Sequential mix scenarios within the group (canale is already fixed by the subset).
  // Level 1: Brand, Level 2: Categoria within Brand, Level 3: Sottocategoria within Brand+Categoria.
  // Same formula as computeMixDecomposition: qS = Q2g × (q1_i / Q1g), fallback l.q2 when Q1g=0.

  function groupScenario(keyFn: (l: ComparedLine) => string): number {
    const gQ1 = new Map<string, number>();
    const gQ2 = new Map<string, number>();
    for (const l of lines) {
      const k = keyFn(l);
      gQ1.set(k, (gQ1.get(k) ?? 0) + l.q1);
      gQ2.set(k, (gQ2.get(k) ?? 0) + l.q2);
    }
    let rev = 0, cost = 0;
    for (const l of lines) {
      const k = keyFn(l);
      const Q1g = gQ1.get(k) ?? 0;
      const Q2g = gQ2.get(k) ?? 0;
      const qS = Q1g > 0 ? Q2g * (l.q1 / Q1g) : l.q2;
      rev  += qS * l.price1Effective;
      cost += qS * l.unitCost1Effective;
    }
    return rev > 0 ? (rev - cost) / rev : marginPctV;
  }

  const mpctBrand = groupScenario(l => l.brand || 'N/D');
  const mpctCat   = groupScenario(l => `${l.brand || 'N/D'}§${l.categoria || 'N/D'}`);
  const mpctSc    = groupScenario(l => `${l.brand || 'N/D'}§${l.categoria || 'N/D'}§${l.sottocategoria || 'N/D'}`);

  const effMixBrand          = mpctBrand - marginPctV;
  const effMixCategoria      = mpctCat   - mpctBrand;
  const effMixSottocategoria = mpctSc    - mpctCat;
  const effMixReferenza      = eff.effMix - effMixBrand - effMixCategoria - effMixSottocategoria;

  return {
    cosP1:  kpis.marginPctP1,
    cosP2:  kpis.marginPctP2,
    effVolume: eff.effVolume,
    effMixBrand,
    effMixCategoria,
    effMixSottocategoria,
    effMixReferenza,
    effPrezzo: eff.effPrezzo,
    effCosto:  eff.effCosto,
    presence,
  };
}

// ─── validateQuantityConservation ────────────────────────────────────────────
// Invariant: every hybrid mix scenario redistributes Q2 among referenze without
// changing the total. Violated only by floating-point accumulation (|diff| < 1e-6
// expected). A larger error signals a bug in buildScenario.

export function validateQuantityConservation(
  lines: ComparedLine[],
  Q2: number,
  tol = 0.001,
): boolean {
  const checks: [string, number][] = [
    ['Σ q2',           lines.reduce((s, l) => s + l.q2,               0)],
    ['Σ qMixCanale',   lines.reduce((s, l) => s + (l.qMixCanale  ?? 0), 0)],
    ['Σ qMixBrand',    lines.reduce((s, l) => s + (l.qMixBrand   ?? 0), 0)],
    ['Σ qMixCat',      lines.reduce((s, l) => s + (l.qMixCat     ?? 0), 0)],
    ['Σ qMixSubCat',   lines.reduce((s, l) => s + (l.qMixSubCat  ?? 0), 0)],
    ['Σ qMixFormato',  lines.reduce((s, l) => s + (l.qMixFormato ?? 0), 0)],
  ];

  let ok = true;
  dbg('─── Quantity conservation check ─────────────────────────────────');
  dbg('Q2 reference:', Q2.toFixed(4));
  for (const [label, sum] of checks) {
    const diff = Math.abs(sum - Q2);
    const pass = diff <= tol;
    dbg(`${label}: ${sum.toFixed(4)}  diff=${diff.toFixed(6)}  ${pass ? '✓ OK' : '⚠ FAIL'}`);
    if (!pass) {
      console.warn(
        `[VARIANCE] Quantity conservation FAILED for ${label}:`,
        `sum=${sum.toFixed(4)}, Q2=${Q2.toFixed(4)}, diff=${diff.toFixed(6)}`,
      );
      ok = false;
    }
  }
  dbg('────────────────────────────────────────────────────────────────');
  return ok;
}

// ─── computeVarianceEffects — main entry point ────────────────────────────────
// Flow: getReferenceKeyFn → aggregatePeriod × 2 → fullOuterJoin → kpis
//       → enrichWithMix → effects → quadrature → tableGroups → waterfall → drivers

export function computeVarianceEffects(
  rowsP1: VarRow[],
  rowsP2: VarRow[],
): EffectsResult {
  dbg('─── computeVarianceEffects ─────────────────────────────────────');
  dbg('P1 raw rows:', rowsP1.length);
  dbg('P2 raw rows:', rowsP2.length);

  // ── Reference key function — built from combined dataset ─────────────────
  // canale is prepended so the same SKU in different channels stays separate
  const baseGetKey = buildReferenceKeyFn([...rowsP1, ...rowsP2]);
  const getKey = (r: VarRow) => `${r.canale || '_nocanale_'}§${baseGetKey(r)}`;

  // ── Step 5: aggregate by referenceKey ───────────────────────────────────
  const agg1 = aggregatePeriod(rowsP1, getKey);
  const agg2 = aggregatePeriod(rowsP2, getKey);

  dbg('P1 referenze:', agg1.size);
  dbg('P2 referenze:', agg2.size);

  const keysOnlyP1 = [...agg1.keys()].filter(k => !agg2.has(k));
  const keysOnlyP2 = [...agg2.keys()].filter(k => !agg1.has(k));
  const keysBoth   = [...agg1.keys()].filter(k =>  agg2.has(k));

  dbg('Keys only P1:', keysOnlyP1.length, keysOnlyP1.slice(0, 5));
  dbg('Keys only P2:', keysOnlyP2.length, keysOnlyP2.slice(0, 5));
  dbg('Keys both:   ', keysBoth.length);

  // ── Step 6: full outer join ──────────────────────────────────────────────
  const lines = fullOuterJoinPeriods(agg1, agg2);
  dbg('technicalRows (after join):', lines.length);

  // ── Step 8: base KPIs from technicalRows ────────────────────────────────
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

  // ── Enrich lines with mix1/mix2 ─────────────────────────────────────────
  enrichWithMix(lines, kpis.Q1, kpis.Q2);

  const sumMix1 = lines.reduce((s, l) => s + l.mix1, 0);
  const sumMix2 = lines.reduce((s, l) => s + l.mix2, 0);
  dbg('Sum mix1:', sumMix1.toFixed(6), '(expected ≈ 1)');
  dbg('Sum mix2:', sumMix2.toFixed(6), '(expected ≈ 1)');

  // ── Step 9: variance effects ────────────────────────────────────────────
  const eff = calculateVarianceEffects(lines, kpis);

  dbg('effVolume:', (eff.effVolume * 100).toFixed(4), 'pp');
  dbg('effMix:   ', (eff.effMix    * 100).toFixed(4), 'pp');
  dbg('effPrezzo:', (eff.effPrezzo * 100).toFixed(4), 'pp');
  dbg('effCosto: ', (eff.effCosto  * 100).toFixed(4), 'pp');

  // Lines with fallback applied
  const fallbackLines = lines.filter(l => l.flags.priceFallback || l.flags.costFallback);
  if (fallbackLines.length > 0)
    dbg('Fallback applied to:', fallbackLines.length, 'referenze',
        fallbackLines.map(l => l.key).slice(0, 10));

  // ── Step 13: quadrature ──────────────────────────────────────────────────
  const quad = validateVarianceBridge(kpis, eff);

  if (!quad.isBalanced) {
    dbg('⚠ QUADRATURE FAILED — problematic lines:',
        lines.filter(l => l.flags.priceFallback || l.flags.costFallback || l.warnings.length > 0)
             .map(l => ({ key: l.key, presence: l.presence, warnings: l.warnings })));
  }

  // ── Mix hierarchical decomposition (mutates lines with qMix* fields) ────
  const mixDecomposition = computeMixDecomposition(lines, eff.marginPctV, eff.marginPctM);

  // ── Step 10: rollup for display ──────────────────────────────────────────
  const tableGroups = buildTableGroups(lines);

  dbg('tableGroups:', tableGroups.length);

  // ── Waterfall data ───────────────────────────────────────────────────────
  const waterfallRev = buildCategoryWaterfall(
    lines, l => l.rev1, l => l.rev2, kpis.totalRev1, kpis.totalRev2,
  );
  const waterfallMargin = buildCategoryWaterfall(
    lines, l => l.margin1, l => l.margin2, kpis.totalMargin1, kpis.totalMargin2,
  );
  const waterfallMarginPct = buildEffectsWaterfall(
    kpis.marginPctP1, eff.effVolume, eff.effMix,
    eff.effPrezzo, eff.effCosto, kpis.marginPctP2,
  );

  // ── Top drivers — reference-level, not rollup ───────────────────────────
  // Rank by |deltaMarginPct| for lines present in both periods.
  // onlyP1/onlyP2 have null deltaMarginPct and are excluded from % rankings.
  const withDelta    = lines.filter(l => l.deltaMarginPct !== null);
  const topVariations = [...withDelta]
    .sort((a, b) => Math.abs(b.deltaMarginPct!) - Math.abs(a.deltaMarginPct!)).slice(0, 3);
  const topBest = [...withDelta]
    .filter(l => (l.deltaMarginPct ?? 0) > 0)
    .sort((a, b) => b.deltaMarginPct! - a.deltaMarginPct!).slice(0, 3);
  const topWorst = [...withDelta]
    .sort((a, b) => a.deltaMarginPct! - b.deltaMarginPct!).slice(0, 3);

  dbg('─── Done ───────────────────────────────────────────────────────');

  return {
    totalRev1: kpis.totalRev1, totalRev2: kpis.totalRev2,
    totalCost1: kpis.totalCost1, totalCost2: kpis.totalCost2,
    totalMargin1: kpis.totalMargin1, totalMargin2: kpis.totalMargin2,
    marginPctP1: kpis.marginPctP1, marginPctP2: kpis.marginPctP2,
    effVolume: eff.effVolume, effMix: eff.effMix,
    effPrezzo: eff.effPrezzo, effCosto: eff.effCosto,
    totalRevM: eff.totalRevM,
    expectedP2: quad.expectedP2,
    quadratureDiff: quad.quadratureDiff,
    isBalanced: quad.isBalanced,
    lines, tableGroups,
    waterfallRev, waterfallMargin, waterfallMarginPct,
    topVariations, topBest, topWorst,
    mixDecomposition,
  };
}

// ─── generateInsights (deterministic) ────────────────────────────────────────

export function generateInsights(e: EffectsResult): AIInsight[] {
  const md           = e.mixDecomposition;
  const revGrowth    = e.totalRev1 > 0 ? (e.totalRev2 - e.totalRev1) / e.totalRev1 * 100 : 0;
  const effPrPct     = e.effPrezzo * 100;
  const effCoPct     = e.effCosto  * 100;
  const effMixPct    = e.effMix    * 100;
  const marginGrowth = e.totalMargin1 !== 0
    ? (e.totalMargin2 - e.totalMargin1) / Math.abs(e.totalMargin1) * 100 : 0;
  const deltaMargPct = (e.marginPctP2 - e.marginPctP1) * 100;

  const pos = (n: number) => n >= 0 ? '+' : '';
  const pp  = (n: number) => `${pos(n)}${(n * 100).toFixed(2)} pp`;
  const MIN = 0.0005; // soglia 0.05 pp per mostrare un livello
  const insights: AIInsight[] = [];

  // ── 1. Fatturato ────────────────────────────────────────────────────────────
  if (revGrowth > 10)
    insights.push({ title: 'Crescita Fatturato Significativa', type: 'positive',
      text: `Il fatturato è cresciuto del ${revGrowth.toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}), segnalando una forte espansione commerciale.` });
  else if (revGrowth > 0)
    insights.push({ title: 'Crescita Fatturato Moderata', type: 'positive',
      text: `Il fatturato registra una crescita contenuta del ${revGrowth.toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}).` });
  else
    insights.push({ title: 'Contrazione Fatturato', type: 'negative',
      text: `Il fatturato si è ridotto del ${Math.abs(revGrowth).toFixed(1)}% (da ${fmtE(e.totalRev1)} a ${fmtE(e.totalRev2)}). Si raccomanda un'analisi dei volumi e del portafoglio.` });

  // ── 2. Effetto Mix — spiegazione per livello ─────────────────────────────────
  const mixParts: string[] = [];
  if (Math.abs(md.canale)         > MIN) mixParts.push(
    `Mix Canale ${pp(md.canale)}: lo spostamento di volumi tra canali di vendita (es. online, retail, wholesale) ha ${md.canale > 0 ? 'migliorato' : 'penalizzato'} il margine — i canali ${md.canale > 0 ? 'più profittevoli' : 'meno profittevoli'} pesano di più in P2`);
  if (Math.abs(md.brand)          > MIN) mixParts.push(
    `Mix Brand ${pp(md.brand)}: la variazione del peso dei brand all'interno di ogni canale ha ${md.brand > 0 ? 'beneficiato' : 'penalizzato'} il margine — i brand ${md.brand > 0 ? 'ad alto margine acquistano' : 'a basso margine acquistano'} quota`);
  if (Math.abs(md.categoria)      > MIN) mixParts.push(
    `Mix Categoria ${pp(md.categoria)}: il riequilibrio tra categorie di prodotto ha ${md.categoria > 0 ? 'migliorato' : 'ridotto'} il margine medio`);
  if (Math.abs(md.sottocategoria) > MIN) mixParts.push(
    `Mix Sottocategoria ${pp(md.sottocategoria)}: la variazione del peso delle sottocategorie ha ${md.sottocategoria > 0 ? 'migliorato' : 'ridotto'} il margine`);
  if (Math.abs(md.formato)        > MIN) mixParts.push(
    `Mix Formato ${pp(md.formato)}: lo spostamento tra formati/confezioni ha ${md.formato > 0 ? 'favorito' : 'penalizzato'} il margine — i formati ${md.formato > 0 ? 'ad alto margine crescono' : 'a basso margine crescono'}`);
  if (Math.abs(md.residuo)        > MIN) mixParts.push(
    `Residuo referenze ${pp(md.residuo)}: all'interno dei singoli formati, il mix tra referenze specifiche ha avuto impatto ${md.residuo > 0 ? 'positivo' : 'negativo'} sul margine`);

  if (Math.abs(effMixPct) < 0.05) {
    insights.push({ title: 'Effetto Mix Neutro', type: 'neutral',
      text: `L'effetto mix complessivo è trascurabile (${pp(e.effMix)}): la composizione del portafoglio non ha subito variazioni significative tra i due periodi.` });
  } else {
    const mixType: AIInsight['type'] = effMixPct >= 1 ? 'positive' : effMixPct <= -1 ? 'negative' : 'neutral';
    const intro = effMixPct >= 0
      ? `Il mix di portafoglio ha contribuito positivamente al margine di ${pp(e.effMix)}.`
      : `Il mix di portafoglio ha penalizzato il margine di ${Math.abs(effMixPct).toFixed(2)} pp (${pp(e.effMix)}).`;
    const detail = mixParts.length
      ? ` Scomposizione per livello: ${mixParts.join('. ')}.`
      : '';
    insights.push({ title: `Effetto Mix ${pp(e.effMix)}`, type: mixType, text: intro + detail });
  }

  // ── 3. Effetto Prezzo ────────────────────────────────────────────────────────
  if (effPrPct > 2)
    insights.push({ title: 'Effetto Prezzo Positivo', type: 'positive',
      text: `L'effetto prezzo contribuisce con ${pos(effPrPct)}${effPrPct.toFixed(2)} pp al margine: i prezzi di vendita medi sono aumentati rispetto al periodo precedente.` });
  else if (effPrPct < -2)
    insights.push({ title: 'Pressione sui Prezzi di Vendita', type: 'negative',
      text: `L'effetto prezzo erode ${Math.abs(effPrPct).toFixed(2)} pp di margine: i prezzi di vendita medi si sono ridotti o si è spostato il volume verso referenze più economiche.` });
  else
    insights.push({ title: 'Prezzi Sostanzialmente Stabili', type: 'neutral',
      text: `L'effetto prezzo è contenuto (${pos(effPrPct)}${effPrPct.toFixed(2)} pp): le variazioni di listino non hanno avuto impatto significativo sul margine.` });

  // ── 4. Effetto Costo ─────────────────────────────────────────────────────────
  if (effCoPct > 2)
    insights.push({ title: 'Riduzione dei Costi di Acquisto', type: 'positive',
      text: `L'effetto costo apporta ${pos(effCoPct)}${effCoPct.toFixed(2)} pp al margine: i costi unitari di acquisto o produzione sono diminuiti rispetto al periodo base.` });
  else if (effCoPct < -2)
    insights.push({ title: 'Incremento dei Costi di Acquisto', type: 'negative',
      text: `L'effetto costo comprime il margine di ${Math.abs(effCoPct).toFixed(2)} pp: i costi unitari sono aumentati — analizzare materie prime, tariffe fornitori e costi di produzione.` });
  else
    insights.push({ title: 'Costi di Acquisto Stabili', type: 'neutral',
      text: `L'effetto costo è trascurabile (${pos(effCoPct)}${effCoPct.toFixed(2)} pp): i costi unitari non hanno subito variazioni rilevanti tra i due periodi.` });

  // ── 5. Margine assoluto ──────────────────────────────────────────────────────
  if (e.totalMargin2 >= e.totalMargin1)
    insights.push({ title: 'Margine Assoluto in Crescita', type: 'positive',
      text: `Il margine assoluto è cresciuto di ${fmtE(e.totalMargin2 - e.totalMargin1)} (+${marginGrowth.toFixed(1)}%), raggiungendo ${fmtE(e.totalMargin2)}.${deltaMargPct >= 0 ? '' : ` Il margine % si riduce di ${Math.abs(deltaMargPct).toFixed(2)} pp.`}` });
  else
    insights.push({ title: 'Margine Assoluto in Contrazione', type: 'negative',
      text: `Il margine assoluto si è ridotto di ${fmtE(Math.abs(e.totalMargin2 - e.totalMargin1))} (${marginGrowth.toFixed(1)}%), scendendo a ${fmtE(e.totalMargin2)}.` });

  return insights;
}
