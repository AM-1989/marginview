import type { BalanceInputYear, BalanceKPI } from '../types';

function safe(n: number, d: number): number {
  return d !== 0 && isFinite(d) ? n / d : 0;
}

/**
 * Income statement cascade:
 *   EBITDA = Ricavi − CDV − OPEX
 *   EBIT   = EBITDA − Ammortamenti
 *   EBT    = EBIT   − Oneri Finanziari
 *   Utile  = EBT    − Imposte
 *
 * PFN = Debiti Finanziari (BT + LT) − Liquidità
 * DSO = Crediti / (Ricavi / 365)
 * DIO = Magazzino / (CDV / 365)
 * DPO = Debiti Commerciali / (CDV / 365)
 */
export function calculateBalanceKPIs(input: BalanceInputYear): BalanceKPI {
  const {
    anno, ricavi, costoDelVenduto, costiOperativi, ammortamenti,
    oneriFinanziari, imposte, creditiClienti, magazzino, debitiFornitori,
    liquidita, debitiFinanziariBT, debitiFinanziariLT, patrimoniNetto,
    attivoCorriente, passivoCorriente,
  } = input;

  // Income statement
  const ebitda     = ricavi - costoDelVenduto - costiOperativi;
  const ebit       = ebitda - ammortamenti;
  const ebt        = ebit   - oneriFinanziari;
  const utileNetto = ebt    - imposte;

  // Leverage
  const debitiFinanziariTot = debitiFinanziariBT + debitiFinanziariLT;
  const pfn = debitiFinanziariTot - liquidita;

  // Working capital cycles (days)
  const dso = ricavi          > 0 ? creditiClienti  / (ricavi          / 365) : 0;
  const dio = costoDelVenduto > 0 ? magazzino        / (costoDelVenduto / 365) : 0;
  const dpo = costoDelVenduto > 0 ? debitiFornitori  / (costoDelVenduto / 365) : 0;

  return {
    anno,

    ebitda,
    ebitdaPerc:     safe(ebitda,     ricavi) * 100,
    ebit,
    ebitPerc:       safe(ebit,       ricavi) * 100,
    utileNetto,
    utileNettoPerc: safe(utileNetto, ricavi) * 100,

    roe: safe(utileNetto,  patrimoniNetto)          * 100,
    roi: safe(ebit,        patrimoniNetto + debitiFinanziariTot) * 100,

    currentRatio: safe(attivoCorriente,              passivoCorriente),
    quickRatio:   safe(attivoCorriente - magazzino,  passivoCorriente),
    cashRatio:    safe(liquidita,                    passivoCorriente),

    pfn,
    pfnEbitda:    safe(pfn, ebitda),
    debtToEquity: safe(debitiFinanziariTot, patrimoniNetto),

    dso,
    dio,
    dpo,
    ccc: dso + dio - dpo,
  };
}
