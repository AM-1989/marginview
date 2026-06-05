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
  revenue:    number;
  cost:       number;
  profit:     number;
  marginPct:  number;
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
  total:          number;
  diversification: number;
  starScore:      number;
  riskScore:      number;
  profitability:  number;
  resilience:     number;
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
  paretoIndex:     number;         // % products making 80% revenue
  starRevenuePct:  number;         // % revenue in AA
  riskRevenuePct:  number;         // % revenue in AC+BC
  belowAvgCount:   number;
  matrix:          Record<SegmentKey, MatrixCell>;
  paretoData:      ParetoPoint[];
  categories:      CategoryStat[];
  health:          HealthScore;
  actions:         ActionItem[];
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

// Improvement direction: higher is better for revenue, higher is better for margin
// AA > AB > BA > AC > BB > BC > CA > CB > CC (quality order)
export const SEGMENT_QUALITY: Record<SegmentKey, number> = {
  AA: 9, AB: 7, BA: 6, BB: 5, AC: 4, CA: 3, BC: 2, CB: 1, CC: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Aggregate raw Excel rows into AnalysisRow[] ───────────────────────────────
// Groups by Referenza, sums revenue and cost across all time periods.

export function aggregateRows(rows: RowExcel[]): AnalysisRow[] {
  const map = new Map<string, AnalysisRow>();
  for (const r of rows) {
    const rev  = r.Quantita * r.PrezzoUnitario;
    const cost = r.Quantita * r.CostoUnitario;
    if (!map.has(r.Referenza)) {
      map.set(r.Referenza, {
        id:        r.Referenza,
        name:      r.Descrizione,
        category:  r.Categoria ?? r.Brand ?? '',
        revenue:   0, cost: 0, profit: 0, marginPct: 0,
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

// ── Parse generic Excel rows (flexible column detection) ──────────────────────

const COL_ALIASES: Record<string, string[]> = {
  id:         ['codice','referenza','sku','code','id','articolo'],
  name:       ['descrizione','nome','prodotto','name','description','articolo','item'],
  revenue:    ['fatturato','revenue','ricavi','vendite','sales','totale'],
  marginPct:  ['margine%','margine_pct','margin%','marginepct','margin_pct','margine pct'],
  cost:       ['costo','costo totale','total cost','cost','costs'],
  profit:     ['margine','profitto','profit','utile'],
  category:   ['categoria','category','famiglia','group','classe','reparto','brand'],
};

function findCol(keys: string[], aliases: string[]): string | undefined {
  const lower = keys.map(k => k.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return keys[idx];
  }
  return undefined;
}

export function parseGenericRows(rows: Record<string, unknown>[]): AnalysisRow[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const C = {
    id:        findCol(keys, COL_ALIASES.id),
    name:      findCol(keys, COL_ALIASES.name),
    revenue:   findCol(keys, COL_ALIASES.revenue),
    marginPct: findCol(keys, COL_ALIASES.marginPct),
    cost:      findCol(keys, COL_ALIASES.cost),
    profit:    findCol(keys, COL_ALIASES.profit),
    category:  findCol(keys, COL_ALIASES.category),
  };

  const parse = (v: unknown) => parseFloat(String(v ?? 0).replace(',', '.')) || 0;

  return rows.map((r, i) => {
    const rev  = C.revenue   ? parse(r[C.revenue])   : 0;
    const cost = C.cost      ? parse(r[C.cost])      : 0;
    const profitVal = C.profit ? parse(r[C.profit]) : rev - cost;
    const mPct = C.marginPct
      ? parse(r[C.marginPct])
      : rev > 0 ? profitVal / rev * 100 : 0;
    return {
      id:        C.id   ? String(r[C.id])   : `P${i + 1}`,
      name:      C.name ? String(r[C.name]) : `Prodotto ${i + 1}`,
      category:  C.category ? String(r[C.category]) : '',
      revenue:   rev,
      cost:      cost,
      profit:    profitVal,
      marginPct: mPct,
    };
  }).filter(r => r.revenue > 0 || r.profit !== 0);
}

// ── Main calculation engine ───────────────────────────────────────────────────

export function calculate(
  rows: AnalysisRow[],
  thresholdA: number,  // pp above weighted avg → class A margin
  thresholdC: number,  // pp below weighted avg → class C margin
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

  const weightedMargin = customMarginRef ?? (totalProfit / totalRevenue * 100);

  // ── Revenue classification (Pareto cumulative) ─────────────────────────────
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

  // ── Margin classification ──────────────────────────────────────────────────
  const products: ClassifiedRow[] = withRev.map(r => {
    const rM: AbcRating =
      r.marginPct >= weightedMargin + thresholdA ? 'A' :
      r.marginPct >= weightedMargin - thresholdC ? 'B' : 'C';
    return { ...r, ratingMargin: rM, segment: `${r.ratingRevenue}${rM}` as SegmentKey };
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

  // ── Pareto index ──────────────────────────────────────────────────────────
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

  // ── Category aggregates ───────────────────────────────────────────────────
  const catMap = new Map<string, CategoryStat>();
  for (const p of products) {
    const cat = p.category || '(N/D)';
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

  // ── KPI ───────────────────────────────────────────────────────────────────
  const starRevenuePct  = matrix.AA.revenuePct;
  const riskRevenuePct  = matrix.AC.revenuePct + matrix.BC.revenuePct;
  const belowAvgCount   = products.filter(p => p.marginPct < weightedMargin).length;

  // ── Health Score ──────────────────────────────────────────────────────────
  const diversification = Math.round((1 - gini) * 100);
  const starScore       = Math.min(100, Math.round(starRevenuePct * 2));
  const riskScore       = Math.round(Math.max(0, 100 - riskRevenuePct * 2));
  const profitability   = Math.min(100, Math.max(0, Math.round((weightedMargin / 30) * 100)));
  const resilience      = Math.min(100, Math.round(paretoIndex * 1.5));
  const healthTotal     = Math.round((diversification + starScore + riskScore + profitability + resilience) / 5);

  // ── Action items ──────────────────────────────────────────────────────────
  const actions: ActionItem[] = [];
  const ac = products.filter(p => p.segment === 'AC');
  const cc = products.filter(p => p.segment === 'CC');
  const ba = products.filter(p => p.segment === 'BA');
  const bc = products.filter(p => p.segment === 'BC');

  if (ac.length > 0) actions.push({
    level: 'error',
    title: `${ac.length} prodott${ac.length > 1 ? 'i' : 'o'} A-C: margine critico`,
    description: 'Alto fatturato ma margine sotto la media. Rivedere pricing o costi di approvvigionamento.',
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
    description: 'Basso fatturato e basso margine. Valutare discontinuazione o repricing aggressivo.',
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
    description: 'Meno del 20% del fatturato è generato da prodotti con alto margine. Investire in sviluppo prodotto.',
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
    }])
  ) as Record<SegmentKey, MatrixCell>;
}

// ── What-if simulation ────────────────────────────────────────────────────────

export function whatIfSimulate(
  products: ClassifiedRow[],
  excludedSegments: SegmentKey[],
): { revenue: number; profit: number; marginPct: number; count: number } {
  const kept = products.filter(p => !excludedSegments.includes(p.segment));
  const revenue   = kept.reduce((s, p) => s + p.revenue, 0);
  const profit    = kept.reduce((s, p) => s + p.profit,  0);
  const marginPct = revenue > 0 ? profit / revenue * 100 : 0;
  return { revenue, profit, marginPct, count: kept.length };
}

// ── Migration matrix (period comparison) ─────────────────────────────────────

export interface MigrationSummary {
  improved:  number;
  stable:    number;
  worsened:  number;
  newItems:  number;
  dropped:   number;
  matrix:    Record<SegmentKey, Record<SegmentKey, number>>;
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
    keys.map(k => [k, Object.fromEntries(keys.map(k2 => [k2, 0]))])
  ) as Record<SegmentKey, Record<SegmentKey, number>>;

  let improved = 0, stable = 0, worsened = 0;

  for (const [id, cRow] of currMap.entries()) {
    const pRow = prevMap.get(id);
    if (!pRow) continue;
    matrix[pRow.segment][cRow.segment]++;
    const q = SEGMENT_QUALITY[cRow.segment] - SEGMENT_QUALITY[pRow.segment];
    if (q > 0) improved++;
    else if (q === 0) stable++;
    else worsened++;
  }

  const prevTotRev = prev.reduce((s, p) => s + p.revenue, 0);
  const currTotRev = curr.reduce((s, p) => s + p.revenue, 0);
  const prevTotPro = prev.reduce((s, p) => s + p.profit, 0);
  const currTotPro = curr.reduce((s, p) => s + p.profit, 0);
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
