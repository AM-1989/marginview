import type {
  RowExcel,
  VariancePeriodData,
  VarianceMixEffect,
  VarianceEffectResult,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DimensionKey = 'Brand' | 'Categoria' | 'Sottocategoria' | 'Formato';

interface PeriodAgg {
  Descrizione: string;
  Brand: string | undefined;
  Categoria: string | undefined;
  Sottocategoria: string | undefined;
  Formato: string | undefined;
  Q: number;          // total quantity
  TotRevenue: number; // Σ(Qi × Pi) across rows
  TotCost: number;    // Σ(Qi × Ci) across rows
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function aggregateByYear(rows: RowExcel[], year: number): Map<string, PeriodAgg> {
  const map = new Map<string, PeriodAgg>();
  for (const row of rows) {
    if (row.Anno !== year) continue;
    if (!map.has(row.Referenza)) {
      map.set(row.Referenza, {
        Descrizione: row.Descrizione,
        Brand: row.Brand,
        Categoria: row.Categoria,
        Sottocategoria: row.Sottocategoria,
        Formato: row.Formato,
        Q: 0,
        TotRevenue: 0,
        TotCost: 0,
      });
    }
    const a = map.get(row.Referenza)!;
    a.Q          += row.Quantita;
    a.TotRevenue += row.Quantita * row.PrezzoUnitario;
    a.TotCost    += row.Quantita * row.CostoUnitario;
  }
  return map;
}

function weightedAvgPrice(agg: PeriodAgg | undefined, fallback: number): number {
  return agg && agg.Q > 0 ? agg.TotRevenue / agg.Q : fallback;
}

function weightedAvgCost(agg: PeriodAgg | undefined, fallback: number): number {
  return agg && agg.Q > 0 ? agg.TotCost / agg.Q : fallback;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Variance analysis with full waterfall decomposition.
 *
 * Mathematical identity (all values in €):
 *   M2 - M1 = effettoVolume + effettoMix + effettoPrezzo + effettoCosto
 *
 * where:
 *   effettoVolume = (Q2_tot - Q1_tot) × m̄1          // pure volume at P1 margins
 *   effettoMix    = Σi(Q2i × m1i) − Q2_tot × m̄1     // shift in product composition
 *   effettoPrezzo = Σi(Q2i × (P2i − P1i))            // selling price changes
 *   effettoCosto  = Σi(Q2i × (C1i − C2i))            // cost changes (sign: ↑cost = negative)
 *
 * Mix breakdown by dimension d, group g (sums to effettoMix for each dimension):
 *   contribution_g = Σ_{i∈g}(Q2i × m1i) − Q2g × m̄1
 *
 * Full outer join cross-period fallback:
 *   new product (exists only in P2): P1 = P2, C1 = C2  → all delta goes to Volume
 *   discontinued (exists only in P1): Q2 = 0           → volume loss at P1 margin
 *
 * @param activeDimensions  Which dimensions to decompose the mix effect by (one
 *                          independent waterfall per dimension is produced).
 */
export function calculateVariance(
  rows: RowExcel[],
  p1Year: number,
  p2Year: number,
  activeDimensions: DimensionKey[]
): VarianceEffectResult {
  const agg1 = aggregateByYear(rows, p1Year);
  const agg2 = aggregateByYear(rows, p2Year);

  // ── Full outer join ────────────────────────────────────────────────────────
  const allRefs = new Set([...agg1.keys(), ...agg2.keys()]);
  const dettaglio: VariancePeriodData[] = [];

  for (const ref of allRefs) {
    const d1 = agg1.get(ref);
    const d2 = agg2.get(ref);
    const meta = d1 ?? d2!; // at least one exists by construction

    // Weighted average unit price/cost per period.
    // Cross-period fallback ensures new/discontinued items don't generate
    // spurious price or cost effects — their delta lands in Volume instead.
    const P1 = weightedAvgPrice(d1, weightedAvgPrice(d2, 0));
    const C1 = weightedAvgCost(d1,  weightedAvgCost(d2, 0));
    const P2 = weightedAvgPrice(d2, weightedAvgPrice(d1, 0));
    const C2 = weightedAvgCost(d2,  weightedAvgCost(d1, 0));

    const Q1 = d1?.Q ?? 0;
    const Q2 = d2?.Q ?? 0;

    dettaglio.push({
      Referenza: ref,
      Descrizione: meta.Descrizione,
      Brand: meta.Brand,
      Categoria: meta.Categoria,
      Sottocategoria: meta.Sottocategoria,
      Formato: meta.Formato,
      Q1, P1, C1,
      Q2, P2, C2,
      Fatturato1: Q1 * P1,
      Fatturato2: Q2 * P2,
      Margine1: Q1 * (P1 - C1),
      Margine2: Q2 * (P2 - C2),
      DeltaMargine: Q2 * (P2 - C2) - Q1 * (P1 - C1),
    });
  }

  // ── Aggregate scalars ─────────────────────────────────────────────────────
  const Q1_tot = dettaglio.reduce((s, d) => s + d.Q1, 0);
  const Q2_tot = dettaglio.reduce((s, d) => s + d.Q2, 0);
  const M1     = dettaglio.reduce((s, d) => s + d.Margine1, 0);
  const M2     = dettaglio.reduce((s, d) => s + d.Margine2, 0);

  // Average unit margin in P1 — the "baseline" used by Volume and Mix formulas
  const m1_avg = Q1_tot > 0 ? M1 / Q1_tot : 0;

  // ── Four waterfall effects ─────────────────────────────────────────────────
  const effettoVolume = (Q2_tot - Q1_tot) * m1_avg;

  // Internal total mix (not exposed in return type, used only for quadrature)
  const sum_Q2i_m1i   = dettaglio.reduce((s, d) => s + d.Q2 * (d.P1 - d.C1), 0);
  const effettoMix    = sum_Q2i_m1i - Q2_tot * m1_avg;

  const effettoPrezzo = dettaglio.reduce((s, d) => s + d.Q2 * (d.P2 - d.P1), 0);
  const effettoCosto  = dettaglio.reduce((s, d) => s + d.Q2 * (d.C1 - d.C2), 0);

  // ── Quadrature check ──────────────────────────────────────────────────────
  const deltaMargineTotale = M2 - M1;
  const sumEffects  = effettoVolume + effettoMix + effettoPrezzo + effettoCosto;
  const imbalance   = sumEffects - deltaMargineTotale;
  if (Math.abs(imbalance) > 0.01) {
    console.warn(
      `[varianceAnalysis] Quadrature imbalance: ${imbalance.toFixed(4)} € ` +
      `(ΔM expected ${deltaMargineTotale.toFixed(2)}, sum of effects ${sumEffects.toFixed(2)})`
    );
  }

  // ── Mix breakdown per active dimension ───────────────────────────────────
  //
  // For each dimension d, each unique group value g:
  //   contribution_g = Σ_{i∈g}(Q2i × m1i)  −  Q2g × m̄1
  //
  // Property: Σ_g contribution_g  =  effettoMix  (for every dimension independently)
  // Implication for UI: show one waterfall per dimension, do NOT sum across dimensions.
  //
  const effettiMix: VarianceMixEffect[] = [];

  for (const dim of activeDimensions) {
    const groups = new Map<string, { sumQ2m1: number; Q2g: number }>();

    for (const d of dettaglio) {
      const groupVal = (d[dim] as string | undefined) ?? '(N/D)';
      if (!groups.has(groupVal)) groups.set(groupVal, { sumQ2m1: 0, Q2g: 0 });
      const g = groups.get(groupVal)!;
      g.sumQ2m1 += d.Q2 * (d.P1 - d.C1);
      g.Q2g     += d.Q2;
    }

    for (const [label, g] of groups.entries()) {
      effettiMix.push({
        dimension: dim,
        label,
        effect: g.sumQ2m1 - g.Q2g * m1_avg,
      });
    }
  }

  return {
    effettoVolume,
    effettoPrezzo,
    effettoCosto,
    effettiMix,
    deltaMargineTotale,
    dettaglio,
  };
}
