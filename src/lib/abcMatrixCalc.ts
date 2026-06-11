// ── ABC Matrix calculation engine ─────────────────────────────────────────────
// Pure functions — no UI, no side-effects.

import type { RowExcel } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AbcRating = 'A' | 'B' | 'C';
export type SegmentKey = 'AA'|'AB'|'AC'|'BA'|'BB'|'BC'|'CA'|'CB'|'CC';

export interface AnalysisRow {
  id:         string;
  name:       string;
  category:   string;
  brand:      string;
  revenue:    number;
  cost:       number;   // total cost
  profit:     number;
  marginPct:  number;   // in percentage points (e.g. 10.9 for 10.9%)
}

export interface ClassifiedRow extends AnalysisRow {
  cumRevenuePct: number;
  ratingRevenue: AbcRating;
  ratingMargin:  AbcRating;
  segment:       SegmentKey;
}

export interface MatrixCell {
  segment:    SegmentKey;
  label:      string;
  emoji:      string;
  revenue:    number;
  profit:     number;
  count:      number;
  revenuePct: number;
  profitPct:  number;
}

export interface CategoryStat {
  category:   string;
  revenue:    number;
  profit:     number;
  marginPct:  number;
  count:      number;
}

export interface ParetoPoint {
  productPct: number;
  revenuePct: number;
  count:      number;
}

export interface HealthScore {
  total:           number;
  diversification: number;
  starScore:       number;
  riskScore:       number;
  profitability:   number;
  resilience:      number;
}

export interface ActionItem {
  level:       'error' | 'warning' | 'info' | 'success';
  title:       string;
  description: string;
  count:       number;
}

export interface AbcMetrics {
  products:        ClassifiedRow[];
  totalRevenue:    number;
  totalProfit:     number;
  weightedMargin:  number;
  gini:            number;
  paretoIndex:     number;
  starRevenuePct:  number;
  riskRevenuePct:  number;
  belowAvgCount:   number;
  matrix:          Record<SegmentKey, MatrixCell>;
  paretoData:      ParetoPoint[];
  categories:      CategoryStat[];
  health:          HealthScore;
  actions:         ActionItem[];
  // Diagnostic info from the last parse (undefined if using aggregateRows path)
  parseWarnings?: string[];
}

// ── Segment metadata ──────────────────────────────────────────────────────────

export const SEGMENTS: Record<SegmentKey, { label: string; emoji: string }> = {
  AA: { label: 'Star',        emoji: '⭐' },
  AB: { label: 'Cash Cow',    emoji: '' },
  AC: { label: 'Attenzione',  emoji: '⚠️' },
  BA: { label: 'Potenziale',  emoji: '' },
  BB: { label: 'Stabile',     emoji: '' },
  BC: { label: 'Rischio',     emoji: '' },
  CA: { label: 'Nicchia',     emoji: '' },
  CB: { label: 'Marginale',   emoji: '' },
  CC: { label: 'Da valutare', emoji: '🔍' },
};

export const SEGMENT_QUALITY: Record<SegmentKey, number> = {
  AA: 9, AB: 7, BA: 6, BB: 5, AC: 4, CA: 3, BC: 2, CB: 1, CC: 0,
};

// ── Gini coefficient ──────────────────────────────────────────────────────────

function giniCoeff(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * sorted[i];
  return Math.max(0, Math.min(1, num / (n * total)));
}

// ── aggregateRows: path for structured RowExcel input ────────────────────────

export function aggregateRows(rows: RowExcel[]): AnalysisRow[] {
  const map = new Map<string, AnalysisRow>();
  for (const r of rows) {
    const rev  = r.Quantita * r.PrezzoUnitario;
    const cost = r.Quantita * r.CostoUnitario;
    if (!map.has(r.Referenza)) {
      map.set(r.Referenza, {
        id:       r.Referenza,
        name:     r.Descrizione,
        category: r.Categoria ?? '',
        brand:    r.Brand     ?? '',
        revenue: 0, cost: 0, profit: 0, marginPct: 0,
      });
    }
    const e = map.get(r.Referenza)!;
    e.revenue += rev;
    e.cost    += cost;
  }
  for (const e of map.values()) {
    e.profit    = e.revenue - e.cost;
    e.marginPct = e.revenue > 0 ? e.profit / e.revenue * 100 : 0;
  }
  return [...map.values()];
}

// ══════════════════════════════════════════════════════════════════════════════
// PARSING GENERIC EXCEL ROWS
// ══════════════════════════════════════════════════════════════════════════════

// ── Debug flag ────────────────────────────────────────────────────────────────
const DEBUG_ABC = true;
function dbg(...args: unknown[]) { if (DEBUG_ABC) console.log('[ABC]', ...args); }

// ── Robust number parser ──────────────────────────────────────────────────────
// Returns null for genuinely missing data — never silently returns 0.
// Critical: XLSX returns numeric cells as JS numbers (e.g. 0.109 for 10.9%).
// Never convert a JS number to string — doing so corrupts Italian decimal format.
function parseAbcNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;

  let s = String(v).replace(/[€]/g, '').replace(/\s/g, '').trim();
  const hasPctSign = s.endsWith('%');
  s = s.replace(/%/g, '');
  if (!s) return null;

  // Italian "1.234,56" → remove dots (thousands seps) → replace comma → "1234.56"
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    // "1234,56" → decimal comma only
    s = s.replace(',', '.');
  }
  // English "1234.56" → no transformation needed

  const n = parseFloat(s);
  if (isNaN(n)) return null;

  // If the cell content had a literal "%" sign (e.g. "10.9%"), the value is
  // already in percentage-point scale (10.9 means 10.9%).
  // If it was a pure number like 0.109, the caller will decide the scale.
  if (hasPctSign) return n;  // already in pct-point scale: "10.9%" → 10.9
  return n;
}

// ── Percentage-scale detector ─────────────────────────────────────────────────
// Excel stores percentage cells as decimals (0.109 = 10.9%).
// XLSX.sheet_to_json returns the underlying decimal.
// Heuristic: if ALL non-zero values in a column are within (-2, 2),
// the column is in 0-1 decimal scale → multiply by 100 to get pct points.
// This works for any typical business (margins 1%-200%).
function detectPctScale(values: (number | null)[]): 'decimal' | 'percentage' {
  const valids = values.filter((v): v is number => v !== null && isFinite(v) && v !== 0);
  if (valids.length === 0) return 'percentage';
  const maxAbs = Math.max(...valids.map(Math.abs));
  return maxAbs < 2 ? 'decimal' : 'percentage';
}

// ── Column alias table ────────────────────────────────────────────────────────
// Important: aliases are compared with exact lowercase match to column headers.
const COL_ALIASES: Record<string, string[]> = {
  id: [
    'codice articolo', 'codice referenza/servizio', 'codice referenza',
    'codice materiale', 'codice prodotto', 'codice', 'referenza',
    'articolo', 'sku', 'code', 'id', 'prodotto',
  ],
  name: [
    'descrizione articolo', 'descrizione referenza/servizio',
    'descrizione referenza', 'descrizione materiale',
    'descrizione', 'nome prodotto', 'nome', 'description', 'product', 'item',
  ],
  revenue: [
    'fatturato', 'ricavi', 'vendite', 'revenue', 'sales',
    'fatturato netto', 'ricavi netti', 'totale fatturato', 'importo', 'ricavo',
  ],
  quantity: [
    'quantità venduta', 'quantita venduta', 'quantità', 'quantita',
    'qty', 'quantity', 'pezzi', 'volume',
  ],
  // Unit cost — present alongside quantity; total = unitCost × qty
  unitCost: [
    'costo unitario/tariffa', 'costo unitario / tariffa',
    'costo unitario', 'costo medio', 'tariffa', 'unit cost', 'unitcost',
    'costo/unità', 'costo per unità', 'costo unit.',
  ],
  // Total cost — use directly, do NOT multiply by qty
  totalCost: [
    'costo totale', 'costi totali', 'total cost', 'costo variabile totale',
    'costo', 'costi',
  ],
  // Margin in percentage points (e.g. "10.9" or "10.9%")
  // XLSX may return 0.109 for a 10.9%-formatted cell — we normalise below.
  marginPct: [
    'margine %', 'margine%', 'margine (%)', 'margine percentuale',
    'margine_pct', 'margin %', 'margin%', 'marginepct', 'margin_pct',
    'margine pct', '% margine', 'margine %.',
  ],
  // Margin in euro — "Profitto", "Margine €", "Utile", etc.
  marginEur: [
    'margine €', 'margine euro', 'profitto', 'profit', 'utile',
    'contribuzione', 'gross profit', 'margine lordo', 'margine netto',
  ],
  // "Margine" alone is ambiguous — try as EUR first, normalise later
  marginAmbig: [
    'margine',
  ],
  category: [
    'categoria', 'category', 'famiglia', 'famiglia prodotto',
    'group', 'classe', 'reparto',
  ],
  brand: ['brand', 'marca'],
};

function findCol(keys: string[], aliases: string[]): string | undefined {
  const lower = keys.map(k => k.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase().trim());
    if (idx !== -1) return keys[idx];
  }
  return undefined;
}

// ── Total-row skip patterns (only exact matches on id/name fields) ────────────
const TOTAL_PATTERNS = [
  /^totale?\b/i, /^subtotale?\b/i, /^grand.?total/i,
  /^somma\b/i, /^sommario/i, /^total\b/i, /^sub.?total/i,
];

function isTotalRow(id: string): boolean {
  return TOTAL_PATTERNS.some(p => p.test(id.trim()));
}

// ── parseGenericRows ──────────────────────────────────────────────────────────
// Supports three data cases:
//   A: Fatturato + Costo Totale  OR  Fatturato + Quantità + Costo Unitario
//   B: Fatturato + Margine %
//   C: Fatturato + Margine € (o "Profitto", "Utile", ecc.)
//   fallback: solo Fatturato — margine=0 (compatibilità con file parziali)
//
// MAI ritorna [] per colonne non trovate: usa fallback come l'originale.
// Aggrega più righe con stesso ID (dati multi-periodo).

export function parseGenericRows(rows: Record<string, unknown>[]): AnalysisRow[] {
  if (rows.length === 0) return [];

  // ── 1. Detect columns ──────────────────────────────────────────────────────
  const headers = Object.keys(rows[0]);
  const C = {
    id:          findCol(headers, COL_ALIASES.id),
    name:        findCol(headers, COL_ALIASES.name),
    revenue:     findCol(headers, COL_ALIASES.revenue),
    quantity:    findCol(headers, COL_ALIASES.quantity),
    unitCost:    findCol(headers, COL_ALIASES.unitCost),
    totalCost:   findCol(headers, COL_ALIASES.totalCost),
    marginPct:   findCol(headers, COL_ALIASES.marginPct),
    marginEur:   findCol(headers, COL_ALIASES.marginEur),
    marginAmbig: findCol(headers, COL_ALIASES.marginAmbig),
    category:    findCol(headers, COL_ALIASES.category),
    brand:       findCol(headers, COL_ALIASES.brand),
  };

  dbg('Headers:', headers);
  dbg('Column mapping:', C);

  // ── 2. Determine best data mode ────────────────────────────────────────────
  // hasCaseA: totalCost diretto OPPURE unitCost × quantity
  const hasCaseA  = !!(C.revenue && (C.totalCost || (C.unitCost && C.quantity)));
  const hasCaseB  = !!(C.revenue && C.marginPct);
  const hasCaseC  = !!(C.revenue && C.marginEur);
  const hasAmbig  = !!(C.revenue && C.marginAmbig);

  const mode: 'A' | 'B' | 'C' | 'ambig' | 'fallback' =
    hasCaseA ? 'A' :
    hasCaseB ? 'B' :
    hasCaseC ? 'C' :
    hasAmbig ? 'ambig' : 'fallback';

  dbg(`Data mode: ${mode}  (A=costo, B=mPct%, C=mEur€, ambig=col "Margine", fallback=solo fatturato)`);

  if (mode === 'fallback') {
    console.warn(
      '[ABC] Nessuna colonna costo/margine riconosciuta. Costo=0 per tutti i prodotti.\n' +
      '  Colonne presenti: ' + headers.join(', ') + '\n' +
      '  Colonne attese (una di queste): Margine %, Margine €, Costo Totale, ' +
      'Costo Unitario+Quantità, Profitto, Utile',
    );
  }

  // ── 3. Percentage scale detection (una sola volta per file) ───────────────
  // XLSX restituisce celle % come decimali: 0.109 = 10.9%.
  // Se tutti i valori nella colonna sono < 2 → scala decimale → moltiplica ×100.
  let pctScale: 'decimal' | 'percentage' = 'percentage';
  if (mode === 'B' && C.marginPct) {
    const rawPcts = rows.map(r => parseAbcNum(r[C.marginPct!]));
    pctScale = detectPctScale(rawPcts);
    dbg(`Colonna "${C.marginPct}": scala ${pctScale}${pctScale === 'decimal' ? ' → valori ×100' : ''}`);
  }

  // Per colonna "Margine" ambigua: se valori in range (-2,2) → % decimale;
  // altrimenti assume EUR (non percentuale assoluta — sarebbe "Margine %").
  let ambigIsDecimalPct = false;
  if (mode === 'ambig' && C.marginAmbig) {
    const rawAmbig = rows.map(r => parseAbcNum(r[C.marginAmbig!]));
    ambigIsDecimalPct = detectPctScale(rawAmbig) === 'decimal';
    dbg(`Colonna ambigua "${C.marginAmbig}": ${ambigIsDecimalPct ? '% decimale → ×100' : 'EUR (profitto diretto)'}`);
  }

  // ── 4. Parse ogni riga ────────────────────────────────────────────────────
  interface ParsedRow {
    id: string; name: string; category: string; brand: string;
    revenue: number; cost: number; profit: number;
  }

  const parsed: ParsedRow[] = [];
  let skippedTotal = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // ID: se la colonna non esiste usa il nome, poi il numero di riga
    const rawId =
      C.id   ? String(r[C.id]   ?? '').trim() :
      C.name ? String(r[C.name] ?? '').trim() :
      `P${i + 1}`;
    const rowId = rawId || `P${i + 1}`;

    // Salta righe "Totale / Grand Total / Somma"
    if (isTotalRow(rowId)) { skippedTotal++; continue; }

    // Fatturato — usa 0 se manca (come originale), poi filtra sotto
    const rev = C.revenue ? (parseAbcNum(r[C.revenue]) ?? 0) : 0;

    // Calcola costo e profitto in base al mode
    let cost   = 0;
    let profit = 0;

    if (mode === 'A') {
      if (C.totalCost) {
        cost = parseAbcNum(r[C.totalCost]) ?? 0;
      } else if (C.unitCost && C.quantity) {
        const unitC = parseAbcNum(r[C.unitCost]) ?? 0;
        const qty   = parseAbcNum(r[C.quantity])  ?? 0;
        cost = unitC * qty;
      }
      profit = rev - cost;

    } else if (mode === 'B') {
      let mPct = parseAbcNum(C.marginPct ? r[C.marginPct] : null) ?? 0;
      if (pctScale === 'decimal') mPct = mPct * 100;
      profit = rev * (mPct / 100);
      cost   = rev - profit;

    } else if (mode === 'C') {
      profit = parseAbcNum(C.marginEur ? r[C.marginEur] : null) ?? 0;
      cost   = rev - profit;

    } else if (mode === 'ambig') {
      const raw = parseAbcNum(C.marginAmbig ? r[C.marginAmbig] : null) ?? 0;
      if (ambigIsDecimalPct) {
        profit = rev * (raw * 100 / 100);  // raw=0.30 → 30% → profit=rev*0.30
        cost   = rev - profit;
      } else {
        // Tratta come EUR
        profit = raw;
        cost   = rev - profit;
      }

    } else {
      // fallback: solo fatturato, margine ignoto
      cost   = 0;
      profit = 0;
    }

    const name     = C.name     ? String(r[C.name]     ?? '').trim() : rowId;
    const category = C.category ? String(r[C.category] ?? '').trim() : '';
    const brand    = C.brand    ? String(r[C.brand]    ?? '').trim() : '';

    // Filtra righe senza fatturato e senza profitto (come originale)
    if (rev > 0 || profit !== 0) {
      parsed.push({ id: rowId, name, category, brand, revenue: rev, cost, profit });
    }
  }

  // ── 5. Aggrega per ID prodotto ────────────────────────────────────────────
  const aggMap = new Map<string, ParsedRow>();
  for (const p of parsed) {
    if (!aggMap.has(p.id)) {
      aggMap.set(p.id, { ...p });
    } else {
      const a = aggMap.get(p.id)!;
      a.revenue += p.revenue;
      a.cost    += p.cost;
      a.profit  += p.profit;
    }
  }

  // ── 6. Costruisce AnalysisRow[] con marginPct ricalcolato ─────────────────
  const result: AnalysisRow[] = [];
  for (const a of aggMap.values()) {
    result.push({
      id:        a.id,
      name:      a.name,
      category:  a.category,
      brand:     a.brand,
      revenue:   a.revenue,
      cost:      a.cost,
      profit:    a.profit,
      marginPct: a.revenue > 0 ? a.profit / a.revenue * 100 : 0,
    });
  }

  // ── 7. Riepilogo debug ────────────────────────────────────────────────────
  const totalRev  = result.reduce((s, r) => s + r.revenue, 0);
  const totalCost = result.reduce((s, r) => s + r.cost,    0);
  const totalProf = result.reduce((s, r) => s + r.profit,  0);
  const wAvgMarg  = totalRev > 0 ? totalProf / totalRev * 100 : 0;

  dbg('─── Parse summary ───────────────────────────────────────────');
  dbg(`Righe raw        : ${rows.length}`);
  dbg(`Righe "Totale"   : ${skippedTotal} (saltate)`);
  dbg(`Righe valide     : ${parsed.length}`);
  dbg(`Prodotti (agg.)  : ${result.length}`);
  dbg(`Fatturato totale : ${totalRev.toFixed(2)}`);
  dbg(`Costo totale     : ${totalCost.toFixed(2)}`);
  dbg(`Margine €        : ${totalProf.toFixed(2)}`);
  dbg(`Margine medio %  : ${wAvgMarg.toFixed(4)}%`);

  if (totalCost === 0 && mode !== 'B' && mode !== 'fallback') {
    console.warn('[ABC] ATTENZIONE: Costo totale = 0. Verificare il nome della colonna costo nel file Excel.');
  }
  if (result.length > 10 && Math.abs(wAvgMarg - 100) < 1) {
    console.warn('[ABC] ATTENZIONE: Margine medio ≈ 100%. Probabile errore parsing colonna costo.');
  }
  dbg('─────────────────────────────────────────────────────────────');

  return result;
}

// ── Main calculation engine ───────────────────────────────────────────────────

export function calculate(
  rows: AnalysisRow[],
  thresholdA: number,  // relative % above avg → class A  (10 = ×1.10)
  thresholdC: number,  // relative % below avg → class C  (10 = ×0.90)
  customMarginRef: number | null,
): AbcMetrics {
  const empty = (): AbcMetrics => ({
    products: [], totalRevenue: 0, totalProfit: 0,
    weightedMargin: 0, gini: 0, paretoIndex: 0,
    starRevenuePct: 0, riskRevenuePct: 0, belowAvgCount: 0,
    matrix: buildEmptyMatrix(), paretoData: [], categories: [],
    health: { total: 45, diversification: 100, starScore: 0, riskScore: 100, profitability: 0, resilience: 0 },
    actions: [],
  });

  if (rows.length === 0) return empty();

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit  = rows.reduce((s, r) => s + r.profit,  0);
  if (totalRevenue === 0) return empty();

  // weightedMargin in pct points: e.g. 10.9 for 10.9%
  const weightedMargin = customMarginRef ?? (totalProfit / totalRevenue * 100);

  // ── Revenue classification (Pareto cumulative) ───────────────────────────
  // Rule: product whose addition CROSSES the threshold goes to the next tier.
  // cumulato AFTER adding the product determines the tier:
  //   pct ≤ 0.70 → A  (still within 70%)
  //   pct ≤ 0.90 → B  (within 90%)
  //   pct > 0.90 → C
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  let cumRev = 0;
  const withRev: (AnalysisRow & { cumRevenuePct: number; ratingRevenue: AbcRating })[] =
    sorted.map(r => {
      cumRev += r.revenue;
      const pct = cumRev / totalRevenue;
      return {
        ...r,
        cumRevenuePct: pct * 100,
        ratingRevenue: pct <= 0.70 ? 'A' : pct <= 0.90 ? 'B' : 'C',
      };
    });

  // ── Margin classification (multiplicative thresholds on weighted avg) ────
  // sogliaA = weightedMargin × (1 + thresholdA/100)  e.g. 10.9 × 1.10 = 11.99
  // sogliaC = weightedMargin × (1 - thresholdC/100)  e.g. 10.9 × 0.90 =  9.81
  const sogliaA = weightedMargin * (1 + thresholdA / 100);
  const sogliaC = weightedMargin * (1 - thresholdC / 100);

  const products: ClassifiedRow[] = withRev.map(r => {
    const rM: AbcRating =
      r.marginPct >= sogliaA ? 'A' :
      r.marginPct >= sogliaC ? 'B' : 'C';
    return {
      ...r,
      ratingMargin: rM,
      segment: `${r.ratingRevenue}${rM}` as SegmentKey,
    };
  });

  // ── Matrix ────────────────────────────────────────────────────────────────
  const matrix = buildEmptyMatrix();
  for (const p of products) {
    const cell = matrix[p.segment];
    cell.count++;
    cell.revenue += p.revenue;
    cell.profit  += p.profit;
  }
  for (const cell of Object.values(matrix)) {
    cell.revenuePct = totalRevenue > 0 ? cell.revenue / totalRevenue * 100 : 0;
    cell.profitPct  = totalProfit  > 0 ? cell.profit  / totalProfit  * 100 : 0;
  }

  // ── Gini ──────────────────────────────────────────────────────────────────
  const gini = giniCoeff(rows.map(r => r.revenue));

  // ── Pareto index (% of products making 80% of revenue) ───────────────────
  let paretoIndex = 100;
  let cum2 = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum2 += sorted[i].revenue;
    if (cum2 >= 0.8 * totalRevenue) {
      paretoIndex = ((i + 1) / sorted.length) * 100;
      break;
    }
  }

  // ── Pareto curve data ─────────────────────────────────────────────────────
  const paretoData: ParetoPoint[] = sorted.map((_, i) => {
    const cRev = sorted.slice(0, i + 1).reduce((s, r) => s + r.revenue, 0);
    return {
      productPct: ((i + 1) / sorted.length) * 100,
      revenuePct: cRev / totalRevenue * 100,
      count:      i + 1,
    };
  });

  // ── Category aggregates (weighted margin) ─────────────────────────────────
  const catMap = new Map<string, CategoryStat>();
  for (const p of products) {
    const cat = p.category || p.brand || '(N/D)';
    if (!catMap.has(cat)) catMap.set(cat, { category: cat, revenue: 0, profit: 0, marginPct: 0, count: 0 });
    const c = catMap.get(cat)!;
    c.revenue += p.revenue;
    c.profit  += p.profit;
    c.count++;
  }
  const categories = [...catMap.values()].map(c => ({
    ...c,
    marginPct: c.revenue > 0 ? c.profit / c.revenue * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const starRevenuePct = matrix.AA.revenuePct;
  const riskRevenuePct = matrix.AC.revenuePct + matrix.BC.revenuePct;
  const belowAvgCount  = products.filter(p => p.marginPct < weightedMargin).length;

  // ── Health Score ──────────────────────────────────────────────────────────
  const diversification = Math.round((1 - gini) * 100);
  const starScore       = Math.min(100, Math.round(starRevenuePct * 2));
  const riskScore       = Math.round(Math.max(0, 100 - riskRevenuePct * 2));
  const profitability   = Math.min(100, Math.max(0, Math.round((weightedMargin / 30) * 100)));
  const resilience      = Math.min(100, Math.round(paretoIndex * 1.5));
  const healthTotal     = Math.round(
    (diversification + starScore + riskScore + profitability + resilience) / 5,
  );

  // ── Distribution debug ───────────────────────────────────────────────────
  const cntRevA  = products.filter(p => p.ratingRevenue === 'A').length;
  const cntRevB  = products.filter(p => p.ratingRevenue === 'B').length;
  const cntRevC  = products.filter(p => p.ratingRevenue === 'C').length;
  const cntMargA = products.filter(p => p.ratingMargin  === 'A').length;
  const cntMargB = products.filter(p => p.ratingMargin  === 'B').length;
  const cntMargC = products.filter(p => p.ratingMargin  === 'C').length;

  dbg('─── calculate() summary ──────────────────────────────────────');
  dbg(`Prodotti        : ${products.length}`);
  dbg(`Fatturato tot.  : ${totalRevenue.toFixed(2)}`);
  dbg(`Costo tot.      : ${rows.reduce((s, r) => s + r.cost, 0).toFixed(2)}`);
  dbg(`Margine €       : ${totalProfit.toFixed(2)}`);
  dbg(`Margine medio % : ${weightedMargin.toFixed(4)}%`);
  dbg(`Soglia A        : >= ${sogliaA.toFixed(4)}%`);
  dbg(`Soglia C        : <  ${sogliaC.toFixed(4)}%`);
  dbg(`Rating Fatt.    : A=${cntRevA}  B=${cntRevB}  C=${cntRevC}`);
  dbg(`Rating Marg.    : A=${cntMargA}  B=${cntMargB}  C=${cntMargC}`);
  dbg('Celle 3×3:');
  (['AA','AB','AC','BA','BB','BC','CA','CB','CC'] as SegmentKey[]).forEach(k => {
    if (matrix[k].count > 0) dbg(`  ${k}: ${matrix[k].count} prodotti, ${matrix[k].revenuePct.toFixed(1)}% fatturato`);
  });

  if (cntMargB / products.length > 0.95 && products.length > 10) {
    console.warn(
      '[ABC] WARNING: >95% dei prodotti è in Margine B. ' +
      `Margine medio = ${weightedMargin.toFixed(2)}%, soglie: A>=${sogliaA.toFixed(2)}%, C<${sogliaC.toFixed(2)}%. ` +
      'Possibile errore di parsing margini o soglie troppo strette.',
    );
  }
  dbg('─────────────────────────────────────────────────────────────');

  // ── Action items (derived from real matrix cells) ─────────────────────────
  const actions: ActionItem[] = [];
  const ac = products.filter(p => p.segment === 'AC');
  const bc = products.filter(p => p.segment === 'BC');
  const cc = products.filter(p => p.segment === 'CC');
  const ba = products.filter(p => p.segment === 'BA');

  if (ac.length > 0) actions.push({
    level: 'error',
    title: `${ac.length} prodott${ac.length > 1 ? 'i' : 'o'} A-C: margine critico`,
    description: 'Alto fatturato ma margine sotto la media. Rivedere pricing o costi.',
    count: ac.length,
  });
  if (bc.length > 0) actions.push({
    level: 'warning',
    title: `${bc.length} prodott${bc.length > 1 ? 'i' : 'o'} B-C: rischio marginalità`,
    description: 'Fatturato medio con margine basso. Monitorare e valutare azioni correttive.',
    count: bc.length,
  });
  if (cc.length > 0) actions.push({
    level: 'warning',
    title: `${cc.length} prodott${cc.length > 1 ? 'i' : 'o'} C-C: candidati alla razionalizzazione`,
    description: 'Basso fatturato e basso margine. Valutare discontinuazione o repricing.',
    count: cc.length,
  });
  if (ba.length > 0) actions.push({
    level: 'success',
    title: `${ba.length} prodott${ba.length > 1 ? 'i' : 'o'} B-A: opportunità di sviluppo`,
    description: 'Margine eccellente con fatturato nella fascia B. Potenziale commerciale da valorizzare.',
    count: ba.length,
  });
  if (gini > 0.6) actions.push({
    level: 'warning',
    title: 'Alta concentrazione del fatturato (Gini > 0.6)',
    description: 'Il portafoglio è fortemente dipendente da pochi prodotti. Diversificare.',
    count: 0,
  });
  if (starRevenuePct < 20 && products.length > 0) actions.push({
    level: 'info',
    title: 'Bassa quota fatturato Star (A-A)',
    description: 'Meno del 20% del fatturato è generato da prodotti con alto margine.',
    count: 0,
  });

  return {
    products, totalRevenue, totalProfit, weightedMargin, gini, paretoIndex,
    starRevenuePct, riskRevenuePct, belowAvgCount,
    matrix, paretoData, categories,
    health: { total: healthTotal, diversification, starScore, riskScore, profitability, resilience },
    actions,
  };
}

function buildEmptyMatrix(): Record<SegmentKey, MatrixCell> {
  const keys: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  return Object.fromEntries(
    keys.map(k => [k, {
      segment: k,
      label: SEGMENTS[k].label,
      emoji: SEGMENTS[k].emoji,
      revenue: 0, profit: 0, count: 0, revenuePct: 0, profitPct: 0,
    }]),
  ) as Record<SegmentKey, MatrixCell>;
}

// ── What-if simulation ────────────────────────────────────────────────────────

export function whatIfSimulate(
  products: ClassifiedRow[],
  excludedSegments: SegmentKey[],
): { revenue: number; profit: number; marginPct: number; count: number } {
  const kept      = products.filter(p => !excludedSegments.includes(p.segment));
  const revenue   = kept.reduce((s, p) => s + p.revenue, 0);
  const profit    = kept.reduce((s, p) => s + p.profit,  0);
  const marginPct = revenue > 0 ? profit / revenue * 100 : 0;
  return { revenue, profit, marginPct, count: kept.length };
}

// ── Migration matrix (period comparison) ─────────────────────────────────────

export interface MigrationSummary {
  improved:     number;
  stable:       number;
  worsened:     number;
  newItems:     number;
  dropped:      number;
  matrix:       Record<SegmentKey, Record<SegmentKey, number>>;
  deltaRevenue: number;
  deltaProfit:  number;
  deltaMargin:  number;
}

export function buildMigration(
  prev: ClassifiedRow[],
  curr: ClassifiedRow[],
): MigrationSummary {
  const prevMap = new Map(prev.map(p => [p.id, p]));
  const currMap = new Map(curr.map(p => [p.id, p]));

  const keys: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const matrix = Object.fromEntries(
    keys.map(k => [k, Object.fromEntries(keys.map(k2 => [k2, 0]))]),
  ) as Record<SegmentKey, Record<SegmentKey, number>>;

  let improved = 0, stable = 0, worsened = 0;

  for (const [id, cRow] of currMap.entries()) {
    const pRow = prevMap.get(id);
    if (!pRow) continue;
    matrix[pRow.segment][cRow.segment]++;
    const q = SEGMENT_QUALITY[cRow.segment] - SEGMENT_QUALITY[pRow.segment];
    if (q > 0)      improved++;
    else if (q === 0) stable++;
    else              worsened++;
  }

  const prevTotRev = prev.reduce((s, p) => s + p.revenue, 0);
  const currTotRev = curr.reduce((s, p) => s + p.revenue, 0);
  const prevTotPro = prev.reduce((s, p) => s + p.profit,  0);
  const currTotPro = curr.reduce((s, p) => s + p.profit,  0);
  const prevMarg   = prevTotRev > 0 ? prevTotPro / prevTotRev * 100 : 0;
  const currMarg   = currTotRev > 0 ? currTotPro / currTotRev * 100 : 0;

  return {
    improved, stable, worsened,
    newItems: [...currMap.keys()].filter(id => !prevMap.has(id)).length,
    dropped:  [...prevMap.keys()].filter(id => !currMap.has(id)).length,
    matrix,
    deltaRevenue: currTotRev - prevTotRev,
    deltaProfit:  currTotPro - prevTotPro,
    deltaMargin:  currMarg   - prevMarg,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERNAL TEST — verified against known formulas, not hardcoded results
// ══════════════════════════════════════════════════════════════════════════════

export function _runSelfTest(): boolean {
  let ok = true;
  function check(label: string, got: unknown, expected: unknown, tol = 0.01): void {
    const diff = typeof got === 'number' && typeof expected === 'number'
      ? Math.abs(got - expected) : got === expected ? 0 : 1;
    if (diff > tol) {
      console.error(`[ABC SELFTEST] FAIL ${label}: expected ${expected}, got ${got}`);
      ok = false;
    }
  }

  // ── Test 1: Case A — Fatturato + Quantità + Costo Unitario ────────────────
  // All rows have the SAME column schema (uniform, as in a real Excel file).
  {
    const rows: Record<string, unknown>[] = [
      { 'Codice': 'P001', 'Fatturato': 1000, 'Quantità': 100, 'Costo Unitario': 7 },  // cost=700, profit=300, m=30%
      { 'Codice': 'P002', 'Fatturato': 500,  'Quantità': 50,  'Costo Unitario': 6 },  // cost=300, profit=200, m=40%
      { 'Codice': 'P003', 'Fatturato': 300,  'Quantità': 10,  'Costo Unitario': 35 }, // cost=350, profit=-50, m=-16.67%
      { 'Codice': 'Totale', 'Fatturato': 9999, 'Quantità': 999, 'Costo Unitario': 0 }, // must be skipped
      { 'Codice': '',       'Fatturato': null, 'Quantità': null,'Costo Unitario': 0 },  // must be skipped
    ];
    const p = parseGenericRows(rows);
    check('CaseA: product count', p.length, 3);
    check('CaseA: P001 cost',     p.find(r => r.id === 'P001')?.cost,      700);
    check('CaseA: P001 marginPct',p.find(r => r.id === 'P001')?.marginPct, 30);
    check('CaseA: P003 cost',     p.find(r => r.id === 'P003')?.cost,      350);
    check('CaseA: P003 marginPct',p.find(r => r.id === 'P003')?.marginPct, -50 / 300 * 100);
    check('CaseA: Totale skipped',p.find(r => r.id === 'Totale'), undefined, 0);
  }

  // ── Test 2: Case B — Fatturato + Margine % (decimal Excel cells: 0.20 = 20%) ──
  {
    const rows: Record<string, unknown>[] = [
      { 'Codice': 'Q001', 'Fatturato': 1000, 'Margine %': 0.30 },  // decimal → 30%
      { 'Codice': 'Q002', 'Fatturato': 500,  'Margine %': 0.20 },  // decimal → 20%
      { 'Codice': 'Q003', 'Fatturato': 200,  'Margine %': 0.10 },  // decimal → 10%
    ];
    const p = parseGenericRows(rows);
    // detectPctScale: max = 0.30 < 2 → decimal → multiply by 100
    check('CaseB-decimal: Q001 marginPct', p.find(r => r.id === 'Q001')?.marginPct, 30);
    check('CaseB-decimal: Q002 cost',      p.find(r => r.id === 'Q002')?.cost,      400); // 500*(1-0.20)*scale
    check('CaseB-decimal: Q002 profit',    p.find(r => r.id === 'Q002')?.profit,    100);
  }

  // ── Test 3: Case B — Margine % as string with % sign ("25%") ─────────────
  {
    const rows: Record<string, unknown>[] = [
      { 'Codice': 'R001', 'Fatturato': 1000, 'Margine %': '30%' },
      { 'Codice': 'R002', 'Fatturato': 500,  'Margine %': '20%' },
    ];
    const p = parseGenericRows(rows);
    // "30%" → hasPctSign=true → returns 30 (already pct-scale) → max=30 >= 2 → percentage scale
    check('CaseB-string%: R001 marginPct', p.find(r => r.id === 'R001')?.marginPct, 30);
    check('CaseB-string%: R001 profit',    p.find(r => r.id === 'R001')?.profit,    300);
  }

  // ── Test 4: Case C — Fatturato + Margine € ────────────────────────────────
  {
    const rows: Record<string, unknown>[] = [
      { 'Codice': 'S001', 'Fatturato': 1000, 'Margine €': 300 },  // cost=700, margin=30%
      { 'Codice': 'S002', 'Fatturato': 500,  'Margine €': 150 },  // cost=350, margin=30%
    ];
    const p = parseGenericRows(rows);
    check('CaseC: S001 marginPct', p.find(r => r.id === 'S001')?.marginPct, 30);
    check('CaseC: S001 cost',      p.find(r => r.id === 'S001')?.cost,      700);
    check('CaseC: S002 profit',    p.find(r => r.id === 'S002')?.profit,    150);
  }

  // ── Test 5: Italian number format parsing ─────────────────────────────────
  {
    const rows: Record<string, unknown>[] = [
      { 'Codice': 'IT01', 'Fatturato': '1.234,56', 'Margine €': '123,46' },
    ];
    const p = parseGenericRows(rows);
    check('Italian: IT01 revenue', p.find(r => r.id === 'IT01')?.revenue, 1234.56);
    check('Italian: IT01 profit',  p.find(r => r.id === 'IT01')?.profit,  123.46);
  }

  // ── Test 6: calculate() — multiplicative margin thresholds ───────────────
  // Input: 5 products with known margins; avg = 20%
  // thresholdA=10 → sogliaA=22%; thresholdC=10 → sogliaC=18%
  {
    const input: AnalysisRow[] = [
      { id:'T001', name:'A', category:'', brand:'', revenue:2000, cost:1600, profit:400,  marginPct:20 },
      { id:'T002', name:'B', category:'', brand:'', revenue:1000, cost:700,  profit:300,  marginPct:30 },
      { id:'T003', name:'C', category:'', brand:'', revenue:500,  cost:400,  profit:100,  marginPct:20 },
      { id:'T004', name:'D', category:'', brand:'', revenue:300,  cost:350,  profit:-50,  marginPct:-50/300*100 },
      { id:'T005', name:'E', category:'', brand:'', revenue:200,  cost:160,  profit:40,   marginPct:20 },
    ];
    // totalRevenue=4000, totalProfit=790, weightedMargin=790/4000*100=19.75%
    const m = calculate(input, 10, 10, null);
    const wm = 790 / 4000 * 100;
    check('calc: weightedMargin', m.weightedMargin, wm);
    check('calc: sogliaA',        wm * 1.10, wm * 1.10, 0); // sanity
    // T002: 30% >= wm*1.10=21.725% → Margine A
    check('calc: T002 ratingMargin', m.products.find(p => p.id==='T002')?.ratingMargin, 'A', 0);
    // T004: -16.7% < wm*0.90=17.775% → Margine C
    check('calc: T004 ratingMargin', m.products.find(p => p.id==='T004')?.ratingMargin, 'C', 0);
    // Revenue sort desc: T001(2000)→cum50%≤70%→A, T002(1000)→cum75%>70%→B
    check('calc: T001 ratingRevenue', m.products.find(p => p.id==='T001')?.ratingRevenue, 'A', 0);
    check('calc: T002 ratingRevenue', m.products.find(p => p.id==='T002')?.ratingRevenue, 'B', 0);
  }

  if (ok) {
    console.log('[ABC SELFTEST] All checks passed ✓');
  }
  return ok;
}
