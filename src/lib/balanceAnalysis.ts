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
 * ROI = EBIT / Totale Attivo  (formula ROI tradizionale italiana)
 * DSO = Crediti / (Ricavi / 365)
 * DIO = Magazzino / (CDV / 365)
 * DPO = Debiti Commerciali / (CDV / 365)
 * FCF = EBITDA − CAPEX  (proxy di free cash flow operativo)
 */
export function calculateBalanceKPIs(input: BalanceInputYear): BalanceKPI {
  const {
    anno, ricavi, costoDelVenduto, costiOperativi, ammortamenti,
    oneriFinanziari, imposte, creditiClienti, magazzino, debitiFornitori,
    liquidita, debitiFinanziariBT, debitiFinanziariLT, patrimoniNetto,
    totaleAttivo, attivoCorriente, passivoCorriente, capex,
  } = input;

  // Income statement
  const ebitda     = ricavi - costoDelVenduto - costiOperativi;
  const ebit       = ebitda - ammortamenti;
  const ebt        = ebit   - oneriFinanziari;
  const utileNetto = ebt    - imposte;

  // Leverage
  const debitiFinanziariTot = debitiFinanziariBT + debitiFinanziariLT;
  const pfn = debitiFinanziariTot - liquidita;

  // PFN/EBITDA: significativo solo con EBITDA > 0.
  // Con EBITDA ≤ 0 e PFN > 0 → Infinity (debito non servibile); con PFN ≤ 0 → 0.
  const pfnEbitda = ebitda > 0
    ? pfn / ebitda
    : (pfn > 0 ? Infinity : 0);

  // Working capital cycles (days)
  const dso = ricavi          > 0 ? creditiClienti  / (ricavi          / 365) : 0;
  const dio = costoDelVenduto > 0 ? magazzino        / (costoDelVenduto / 365) : 0;
  const dpo = costoDelVenduto > 0 ? debitiFornitori  / (costoDelVenduto / 365) : 0;

  // Cash flow — FCF semplificato: utile netto + ammortamenti (non-cash) − CAPEX.
  // Non include ΔCapitale Circolante (non disponibile come input).
  const freeCashFlow  = utileNetto + ammortamenti - capex;
  const capexToRicavi = safe(capex, ricavi) * 100;

  return {
    anno,

    ebitda,
    ebitdaPerc:     safe(ebitda,     ricavi) * 100,
    ebit,
    ebitPerc:       safe(ebit,       ricavi) * 100,
    utileNetto,
    utileNettoPerc: safe(utileNetto, ricavi) * 100,

    // ROE: se patrimoniNetto ≤ 0 il KPI perde significato (equity negativa).
    // Con entrambi negativi safe() darebbe un valore positivo fuorviante → Infinity segnala stato critico.
    roe: patrimoniNetto > 0
      ? safe(utileNetto, patrimoniNetto) * 100
      : (patrimoniNetto < 0 ? Infinity : 0),
    // ROI = EBIT / Totale Attivo (formula ROI tradizionale italiana)
    roi: safe(ebit, totaleAttivo) * 100,

    currentRatio: safe(attivoCorriente,             passivoCorriente),
    quickRatio:   safe(attivoCorriente - magazzino, passivoCorriente),
    cashRatio:    safe(liquidita,                   passivoCorriente),

    pfn,
    pfnEbitda,
    debtToEquity: safe(debitiFinanziariTot, patrimoniNetto),

    dso,
    dio,
    dpo,
    ccc: dso + dio - dpo,

    freeCashFlow,
    capexToRicavi,
  };
}
