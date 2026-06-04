import type { BalanceInputYear, BalanceKPI } from '../types';

// Division safe against denominator = 0 (returns 0, not ±Infinity / NaN)
function safe(numerator: number, denominator: number): number {
  return denominator !== 0 && isFinite(denominator) ? numerator / denominator : 0;
}

/**
 * Derives all KPIs from a single year's input data.
 *
 * Income statement cascade:
 *   EBITDA = Ricavi − CostoDelVenduto − CostiOperativi
 *   EBIT   = EBITDA − Ammortamenti
 *   EBT    = EBIT   − OneriFinanziari
 *   Utile  = EBT    − Imposte
 *
 * Balance sheet:
 *   AttivoTotale     = AttivitàCorrente + AttivitàNonCorrente
 *   PassivitàCorrn.  = DebitiFornitori  + AltrePassivitàCorrenti
 *   NetDebt          = DebitiFinanziari − Liquidità
 */
export function calculateBalanceKPIs(input: BalanceInputYear): BalanceKPI {
  const {
    anno,
    ricavi,
    costoDelVenduto,
    costiOperativi,
    ammortamenti,
    oneriFinanziari,
    imposte,
    attivitaCorrente,
    rimanenze,
    liquidita,
    attivitaNonCorrente,
    patrimoniNetto,
    debitiFinanziari,
    debitiFornitori,
    altrePassivitaCorrente,
  } = input;

  // ── Income statement ──────────────────────────────────────────────────────
  const ebitda     = ricavi - costoDelVenduto - costiOperativi;
  const ebit       = ebitda - ammortamenti;
  const ebt        = ebit   - oneriFinanziari;
  const utileNetto = ebt    - imposte;

  // ── Balance sheet aggregates ───────────────────────────────────────────────
  const attivoTotale      = attivitaCorrente + attivitaNonCorrente;
  const passivitaCorrente = debitiFornitori   + altrePassivitaCorrente;
  const netDebt           = debitiFinanziari  - liquidita;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  return {
    anno,

    // Profitability (% of revenues)
    ebitda,
    ebitdaPerc:     safe(ebitda,     ricavi)     * 100,
    ebit,
    ebitPerc:       safe(ebit,       ricavi)     * 100,
    utileNetto,
    utileNettoPerc: safe(utileNetto, ricavi)     * 100,

    // Return ratios (%)
    roe: safe(utileNetto, patrimoniNetto) * 100,   // Utile / Equity
    roa: safe(ebit,       attivoTotale)  * 100,   // EBIT  / Total Assets
    ros: safe(ebit,       ricavi)        * 100,   // EBIT  / Revenues (≡ ebitPerc when amm=0)

    // Liquidity ratios (×)
    currentRatio: safe(attivitaCorrente,              passivitaCorrente), // solvency short-term
    quickRatio:   safe(attivitaCorrente - rimanenze,  passivitaCorrente), // excludes illiquid stock
    cashRatio:    safe(liquidita,                     passivitaCorrente), // cash-only coverage

    // Leverage
    debtToEquity:  safe(debitiFinanziari, patrimoniNetto),
    netDebt,
    netDebtEbitda: safe(netDebt, ebitda),
  };
}
