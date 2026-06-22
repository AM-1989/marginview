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

  // Conto Economico
  ricavi: number;
  costoDelVenduto: number;
  costiOperativi: number;
  ammortamenti: number;
  oneriFinanziari: number;
  imposte: number;

  // Stato Patrimoniale
  creditiClienti: number;       // Crediti commerciali
  magazzino: number;            // Magazzino / Rimanenze
  debitiFornitori: number;      // Debiti commerciali
  liquidita: number;
  debitiFinanziariBT: number;   // Debiti finanziari a breve termine
  debitiFinanziariLT: number;   // Debiti finanziari a lungo termine
  patrimoniNetto: number;
  totaleAttivo: number;         // Totale attivo (input diretto)
  attivoCorriente: number;      // Attivo corrente
  passivoCorriente: number;     // Passivo corrente (input diretto)

  // Cash Flow
  capex: number;                // Investimenti (CAPEX)
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
  roe: number;  // Utile Netto / Patrimonio Netto
  roi: number;  // EBIT / (Patrimonio Netto + Debiti Finanziari totali)

  // Liquidity ratios
  currentRatio: number;  // Attivo Corrente / Passivo Corrente
  quickRatio: number;    // (Attivo Corrente - Magazzino) / Passivo Corrente
  cashRatio: number;     // Liquidità / Passivo Corrente

  // Leverage / PFN
  pfn: number;           // Posizione Finanziaria Netta = Deb.Fin.BT + LT - Liquidità
  pfnEbitda: number;     // PFN / EBITDA
  debtToEquity: number;

  // Working capital cycles (days)
  dso: number;  // Days Sales Outstanding
  dio: number;  // Days Inventory Outstanding
  dpo: number;  // Days Payable Outstanding
  ccc: number;  // Cash Conversion Cycle = DSO + DIO - DPO
}

export interface BalanceData {
  years: BalanceInputYear[];
  kpis: BalanceKPI[];
}
