// ─── Raw Excel row (Modulo 1 & 2) ────────────────────────────────────────────

export interface RowExcel {
  // Identifiers
  Referenza: string;
  Descrizione: string;

  // Time dimension
  Anno: number;
  Mese: number;

  // Optional segmentation dimensions
  Brand?: string;
  Categoria?: string;
  Sottocategoria?: string;
  Formato?: string;
  Paese?: string;
  Canale?: string;

  // Financials
  Quantita: number;
  PrezzoUnitario: number;
  CostoUnitario: number;
}

// ─── ABC Analysis ─────────────────────────────────────────────────────────────

export type AbcRating = 'A' | 'B' | 'C';

export interface AbcResult {
  Referenza: string;
  Descrizione: string;
  Brand?: string;
  Categoria?: string;
  Sottocategoria?: string;
  Formato?: string;

  // Aggregated values
  Fatturato: number;
  Costo: number;
  Margine: number;
  MarginePerc: number;
  Quantita: number;

  // Cumulative % used for ABC classification
  FatturatoPercCum: number;
  ProfittoPercCum: number;

  // Ratings
  RatingFatturato: AbcRating;
  RatingProfitto: AbcRating;
  RatingFinale: AbcRating;
}

export interface AbcSummary {
  TotaleFatturato: number;
  TotaleCosto: number;
  TotaleMargine: number;
  MarginePercGlobale: number;
  TotaleQuantita: number;
  NumReferenze: number;

  // Count of refs per rating
  CountA: number;
  CountB: number;
  CountC: number;
}

// ─── Balance / Financial Statements (Modulo 3) ────────────────────────────────

export interface BalanceInputYear {
  anno: number;

  // Income Statement
  ricavi: number;
  costoDelVenduto: number;
  costiOperativi: number;
  ammortamenti: number;
  oneriFinanziari: number;
  imposte: number;

  // Balance Sheet – Assets
  attivitaCorrente: number;
  rimanenze: number;
  creditiClienti: number;
  liquidita: number;
  attivitaNonCorrente: number;

  // Balance Sheet – Liabilities & Equity
  patrimoniNetto: number;
  debitiFinanziari: number;
  debitiFornitori: number;
  altrePassivitaCorrente: number;
}

export interface BalanceKPI {
  anno: number;

  // Profitability
  ebitda: number;
  ebitdaPerc: number;
  ebit: number;
  ebitPerc: number;
  utileNetto: number;
  utileNettoPerc: number;

  // Returns
  roe: number; // Utile / Patrimonio Netto
  roa: number; // EBIT / Totale Attivo
  ros: number; // EBIT / Ricavi

  // Liquidity
  currentRatio: number;   // Attività Corrente / Passività Corrente
  quickRatio: number;     // (Attività Corrente - Rimanenze) / Passività Corrente
  cashRatio: number;      // Liquidità / Passività Corrente

  // Leverage
  debtToEquity: number;
  netDebt: number;
  netDebtEbitda: number;
}

export interface BalanceData {
  years: BalanceInputYear[];
  kpis: BalanceKPI[];
}
