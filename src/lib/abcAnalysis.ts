import type { RowExcel, AbcResult, AbcRating, AbcSummary } from '../types';

// ─── Rating helpers ───────────────────────────────────────────────────────────

// RatingFatturato: cumulative % of total revenue (sorted desc) → A / B / C
function revenueRating(cumPerc: number): AbcRating {
  if (cumPerc <= 0.7) return 'A';
  if (cumPerc <= 0.9) return 'B';
  return 'C';
}

// RatingProfitto: distance of item's margin% from company-wide average
function profitRating(
  marginePerc: number,
  avgMarginePerc: number,
  tolerance: number
): AbcRating {
  if (marginePerc >= avgMarginePerc + tolerance) return 'A';
  if (marginePerc >= avgMarginePerc - tolerance) return 'B';
  return 'C';
}

// RatingFinale: 2D combination matrix
//   Revenue A + Profit A → A    Revenue A + Profit B → A    Revenue A + Profit C → B
//   Revenue B + Profit A → A    Revenue B + Profit B → B    Revenue B + Profit C → C
//   Revenue C + Profit A → B    Revenue C + Profit B → C    Revenue C + Profit C → C
const FINAL_RATING: Record<AbcRating, Record<AbcRating, AbcRating>> = {
  A: { A: 'A', B: 'A', C: 'B' },
  B: { A: 'A', B: 'B', C: 'C' },
  C: { A: 'B', B: 'C', C: 'C' },
};

// ─── Internal accumulator ─────────────────────────────────────────────────────

interface Bucket {
  Descrizione: string;
  Brand?: string;
  Categoria?: string;
  Sottocategoria?: string;
  Formato?: string;
  Quantita: number;
  Fatturato: number;
  Costo: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param rows           Raw Excel rows (all years / all months).
 * @param profitTolerance Percentage points (e.g. 5 means ±5 pp around the average).
 */
export function calculateAbcAnalysis(
  rows: RowExcel[],
  profitTolerance: number
): { summary: AbcSummary; details: AbcResult[] } {
  // ── Step 1: aggregate ──────────────────────────────────────────────────────
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const fatturato = row.Quantita * row.PrezzoUnitario;
    const costo = row.Quantita * row.CostoUnitario;

    if (!buckets.has(row.Referenza)) {
      buckets.set(row.Referenza, {
        Descrizione: row.Descrizione,
        Brand: row.Brand,
        Categoria: row.Categoria,
        Sottocategoria: row.Sottocategoria,
        Formato: row.Formato,
        Quantita: 0,
        Fatturato: 0,
        Costo: 0,
      });
    }
    const b = buckets.get(row.Referenza)!;
    b.Quantita += row.Quantita;
    b.Fatturato += fatturato;
    b.Costo += costo;
  }

  // ── Step 2: company-wide totals ───────────────────────────────────────────
  const allBuckets = [...buckets.values()];
  const totaleFatturato = allBuckets.reduce((s, b) => s + b.Fatturato, 0);
  const totaleCosto     = allBuckets.reduce((s, b) => s + b.Costo, 0);
  const totaleMargine   = totaleFatturato - totaleCosto;
  const totaleQuantita  = allBuckets.reduce((s, b) => s + b.Quantita, 0);
  const avgMarginePerc  = totaleFatturato > 0
    ? (totaleMargine / totaleFatturato) * 100
    : 0;

  // ── Step 3: sort by revenue → assign FatturatoPercCum + ratings ───────────
  const byRevenue = [...buckets.entries()].sort(
    ([, a], [, b]) => b.Fatturato - a.Fatturato
  );

  let cumFatturato = 0;
  // Build rows without ProfittoPercCum (computed in step 4)
  const rows_partial = byRevenue.map(([ref, b]): Omit<AbcResult, 'ProfittoPercCum'> => {
    cumFatturato += b.Fatturato;
    const margine     = b.Fatturato - b.Costo;
    const marginePerc = b.Fatturato > 0 ? (margine / b.Fatturato) * 100 : 0;
    const fattCum     = totaleFatturato > 0 ? cumFatturato / totaleFatturato : 0;

    const ratingFatturato = revenueRating(fattCum);
    const ratingProfitto  = profitRating(marginePerc, avgMarginePerc, profitTolerance);

    return {
      Referenza: ref,
      Descrizione: b.Descrizione,
      Brand: b.Brand,
      Categoria: b.Categoria,
      Sottocategoria: b.Sottocategoria,
      Formato: b.Formato,
      Fatturato: b.Fatturato,
      Costo: b.Costo,
      Margine: margine,
      MarginePerc: marginePerc,
      Quantita: b.Quantita,
      FatturatoPercCum: fattCum,
      RatingFatturato: ratingFatturato,
      RatingProfitto: ratingProfitto,
      RatingFinale: FINAL_RATING[ratingFatturato][ratingProfitto],
    };
  });

  // ── Step 4: sort by margin → assign ProfittoPercCum ──────────────────────
  // Only positive margins contribute to the cumulative profit Pareto curve.
  const totalPosMargine = rows_partial.reduce(
    (s, d) => s + Math.max(d.Margine, 0), 0
  );

  const byProfit = [...rows_partial].sort((a, b) => b.Margine - a.Margine);
  let cumMargine = 0;
  const profitCumMap = new Map<string, number>();
  for (const d of byProfit) {
    cumMargine += Math.max(d.Margine, 0);
    profitCumMap.set(
      d.Referenza,
      totalPosMargine > 0 ? cumMargine / totalPosMargine : 0
    );
  }

  // Merge ProfittoPercCum back into the revenue-sorted list
  const details: AbcResult[] = rows_partial.map(d => ({
    ...d,
    ProfittoPercCum: profitCumMap.get(d.Referenza) ?? 0,
  }));

  // ── Step 5: summary ────────────────────────────────────────────────────────
  const summary: AbcSummary = {
    TotaleFatturato: totaleFatturato,
    TotaleCosto: totaleCosto,
    TotaleMargine: totaleMargine,
    MarginePercGlobale: avgMarginePerc,
    TotaleQuantita: totaleQuantita,
    NumReferenze: buckets.size,
    CountA: details.filter(d => d.RatingFinale === 'A').length,
    CountB: details.filter(d => d.RatingFinale === 'B').length,
    CountC: details.filter(d => d.RatingFinale === 'C').length,
  };

  return { summary, details };
}
