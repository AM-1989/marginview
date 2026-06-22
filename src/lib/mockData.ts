import type { RowExcel, BalanceData } from '../types';

// ─── Sales rows — 2025 vs 2026, multi-month, multi-dimension ─────────────────
// Price/cost shifts between years give the variance module interesting signals.

export const mockRows: RowExcel[] = [
  // ── REF-001  Acqua Minerale 0.5L (A-product, high volume)
  { Referenza: 'REF-001', Descrizione: 'Acqua Minerale 0.5L', Anno: 2025, Mese: 1,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '0.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 8200, PrezzoUnitario: 0.35, CostoUnitario: 0.14 },
  { Referenza: 'REF-001', Descrizione: 'Acqua Minerale 0.5L', Anno: 2025, Mese: 4,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '0.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 9100, PrezzoUnitario: 0.35, CostoUnitario: 0.14 },
  { Referenza: 'REF-001', Descrizione: 'Acqua Minerale 0.5L', Anno: 2026, Mese: 1,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '0.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 9800, PrezzoUnitario: 0.38, CostoUnitario: 0.15 },
  { Referenza: 'REF-001', Descrizione: 'Acqua Minerale 0.5L', Anno: 2026, Mese: 4,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '0.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 10500, PrezzoUnitario: 0.38, CostoUnitario: 0.15 },

  // ── REF-002  Acqua Minerale 1.5L
  { Referenza: 'REF-002', Descrizione: 'Acqua Minerale 1.5L', Anno: 2025, Mese: 1,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '1.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 6000, PrezzoUnitario: 0.55, CostoUnitario: 0.20 },
  { Referenza: 'REF-002', Descrizione: 'Acqua Minerale 1.5L', Anno: 2025, Mese: 7,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '1.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 7400, PrezzoUnitario: 0.55, CostoUnitario: 0.20 },
  { Referenza: 'REF-002', Descrizione: 'Acqua Minerale 1.5L', Anno: 2026, Mese: 1,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '1.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 6200, PrezzoUnitario: 0.58, CostoUnitario: 0.21 },
  { Referenza: 'REF-002', Descrizione: 'Acqua Minerale 1.5L', Anno: 2026, Mese: 7,  Brand: 'AquaPura', Categoria: 'Bevande', Sottocategoria: 'Acque', Formato: '1.5L', Paese: 'IT', Canale: 'GDO',    Quantita: 7800, PrezzoUnitario: 0.58, CostoUnitario: 0.21 },

  // ── REF-003  Succo Arancia 200ml
  { Referenza: 'REF-003', Descrizione: 'Succo Arancia 200ml', Anno: 2025, Mese: 2,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '200ml', Paese: 'IT', Canale: 'HoReCa', Quantita: 3200, PrezzoUnitario: 1.20, CostoUnitario: 0.55 },
  { Referenza: 'REF-003', Descrizione: 'Succo Arancia 200ml', Anno: 2025, Mese: 8,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '200ml', Paese: 'IT', Canale: 'HoReCa', Quantita: 4100, PrezzoUnitario: 1.20, CostoUnitario: 0.55 },
  { Referenza: 'REF-003', Descrizione: 'Succo Arancia 200ml', Anno: 2026, Mese: 2,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '200ml', Paese: 'IT', Canale: 'HoReCa', Quantita: 3500, PrezzoUnitario: 1.30, CostoUnitario: 0.58 },
  { Referenza: 'REF-003', Descrizione: 'Succo Arancia 200ml', Anno: 2026, Mese: 8,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '200ml', Paese: 'IT', Canale: 'HoReCa', Quantita: 4600, PrezzoUnitario: 1.30, CostoUnitario: 0.58 },

  // ── REF-004  Succo Pesca 1L
  { Referenza: 'REF-004', Descrizione: 'Succo Pesca 1L',      Anno: 2025, Mese: 3,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '1L',    Paese: 'IT', Canale: 'GDO',    Quantita: 2100, PrezzoUnitario: 1.80, CostoUnitario: 0.70 },
  { Referenza: 'REF-004', Descrizione: 'Succo Pesca 1L',      Anno: 2026, Mese: 3,  Brand: 'FruttaViva', Categoria: 'Bevande', Sottocategoria: 'Succhi', Formato: '1L',    Paese: 'IT', Canale: 'GDO',    Quantita: 1900, PrezzoUnitario: 1.90, CostoUnitario: 0.74 },

  // ── REF-005  Pasta Fusilli 500g (B-product)
  { Referenza: 'REF-005', Descrizione: 'Pasta Fusilli 500g',  Anno: 2025, Mese: 1,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '500g', Paese: 'IT', Canale: 'GDO',  Quantita: 4500, PrezzoUnitario: 1.10, CostoUnitario: 0.48 },
  { Referenza: 'REF-005', Descrizione: 'Pasta Fusilli 500g',  Anno: 2025, Mese: 6,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '500g', Paese: 'IT', Canale: 'GDO',  Quantita: 4200, PrezzoUnitario: 1.10, CostoUnitario: 0.48 },
  { Referenza: 'REF-005', Descrizione: 'Pasta Fusilli 500g',  Anno: 2026, Mese: 1,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '500g', Paese: 'IT', Canale: 'GDO',  Quantita: 4700, PrezzoUnitario: 1.15, CostoUnitario: 0.51 },
  { Referenza: 'REF-005', Descrizione: 'Pasta Fusilli 500g',  Anno: 2026, Mese: 6,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '500g', Paese: 'IT', Canale: 'GDO',  Quantita: 4400, PrezzoUnitario: 1.15, CostoUnitario: 0.51 },

  // ── REF-006  Pasta Penne 1Kg
  { Referenza: 'REF-006', Descrizione: 'Pasta Penne 1Kg',     Anno: 2025, Mese: 2,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '1Kg',  Paese: 'IT', Canale: 'GDO',  Quantita: 3100, PrezzoUnitario: 1.90, CostoUnitario: 0.80 },
  { Referenza: 'REF-006', Descrizione: 'Pasta Penne 1Kg',     Anno: 2026, Mese: 2,  Brand: 'GranoD\'Oro', Categoria: 'Alimentari', Sottocategoria: 'Pasta', Formato: '1Kg',  Paese: 'IT', Canale: 'GDO',  Quantita: 3400, PrezzoUnitario: 2.00, CostoUnitario: 0.84 },

  // ── REF-007  Olio EVO 750ml (high margin, A-profit)
  { Referenza: 'REF-007', Descrizione: 'Olio EVO 750ml',      Anno: 2025, Mese: 1,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 1800, PrezzoUnitario: 8.50, CostoUnitario: 3.20 },
  { Referenza: 'REF-007', Descrizione: 'Olio EVO 750ml',      Anno: 2025, Mese: 9,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 2100, PrezzoUnitario: 8.50, CostoUnitario: 3.20 },
  { Referenza: 'REF-007', Descrizione: 'Olio EVO 750ml',      Anno: 2026, Mese: 1,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 1950, PrezzoUnitario: 9.20, CostoUnitario: 3.50 },
  { Referenza: 'REF-007', Descrizione: 'Olio EVO 750ml',      Anno: 2026, Mese: 9,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 2300, PrezzoUnitario: 9.20, CostoUnitario: 3.50 },

  // ── REF-008  Olio EVO 250ml (export)
  { Referenza: 'REF-008', Descrizione: 'Olio EVO 250ml',      Anno: 2025, Mese: 3,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '250ml', Paese: 'DE', Canale: 'Export',  Quantita: 900, PrezzoUnitario: 5.00, CostoUnitario: 2.00 },
  { Referenza: 'REF-008', Descrizione: 'Olio EVO 250ml',      Anno: 2026, Mese: 3,  Brand: 'TerraVerde', Categoria: 'Alimentari', Sottocategoria: 'Oli', Formato: '250ml', Paese: 'DE', Canale: 'Export',  Quantita: 1200, PrezzoUnitario: 5.50, CostoUnitario: 2.10 },

  // ── REF-009  Caffè Espresso 250g (C-product, low margin)
  { Referenza: 'REF-009', Descrizione: 'Caffè Espresso 250g', Anno: 2025, Mese: 5,  Brand: 'MattinoBello', Categoria: 'Alimentari', Sottocategoria: 'Caffè', Formato: '250g', Paese: 'IT', Canale: 'HoReCa', Quantita: 600, PrezzoUnitario: 4.20, CostoUnitario: 3.80 },
  { Referenza: 'REF-009', Descrizione: 'Caffè Espresso 250g', Anno: 2026, Mese: 5,  Brand: 'MattinoBello', Categoria: 'Alimentari', Sottocategoria: 'Caffè', Formato: '250g', Paese: 'IT', Canale: 'HoReCa', Quantita: 700, PrezzoUnitario: 4.50, CostoUnitario: 3.90 },

  // ── REF-010  Caffè Miscela Oro 1Kg
  { Referenza: 'REF-010', Descrizione: 'Caffè Miscela Oro 1Kg', Anno: 2025, Mese: 2, Brand: 'MattinoBello', Categoria: 'Alimentari', Sottocategoria: 'Caffè', Formato: '1Kg', Paese: 'IT', Canale: 'GDO',  Quantita: 1100, PrezzoUnitario: 14.00, CostoUnitario: 10.50 },
  { Referenza: 'REF-010', Descrizione: 'Caffè Miscela Oro 1Kg', Anno: 2026, Mese: 2, Brand: 'MattinoBello', Categoria: 'Alimentari', Sottocategoria: 'Caffè', Formato: '1Kg', Paese: 'IT', Canale: 'GDO',  Quantita: 1300, PrezzoUnitario: 15.00, CostoUnitario: 11.20 },

  // ── REF-011  Detersivo Piatti 500ml
  { Referenza: 'REF-011', Descrizione: 'Detersivo Piatti 500ml', Anno: 2025, Mese: 1, Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '500ml', Paese: 'IT', Canale: 'GDO', Quantita: 3800, PrezzoUnitario: 1.60, CostoUnitario: 0.65 },
  { Referenza: 'REF-011', Descrizione: 'Detersivo Piatti 500ml', Anno: 2025, Mese: 7, Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '500ml', Paese: 'IT', Canale: 'GDO', Quantita: 3500, PrezzoUnitario: 1.60, CostoUnitario: 0.65 },
  { Referenza: 'REF-011', Descrizione: 'Detersivo Piatti 500ml', Anno: 2026, Mese: 1, Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '500ml', Paese: 'IT', Canale: 'GDO', Quantita: 4100, PrezzoUnitario: 1.75, CostoUnitario: 0.70 },
  { Referenza: 'REF-011', Descrizione: 'Detersivo Piatti 500ml', Anno: 2026, Mese: 7, Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '500ml', Paese: 'IT', Canale: 'GDO', Quantita: 3900, PrezzoUnitario: 1.75, CostoUnitario: 0.70 },

  // ── REF-012  Ammorbidente 1L
  { Referenza: 'REF-012', Descrizione: 'Ammorbidente 1L',     Anno: 2025, Mese: 4,  Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '1L',    Paese: 'IT', Canale: 'GDO', Quantita: 2200, PrezzoUnitario: 2.40, CostoUnitario: 1.10 },
  { Referenza: 'REF-012', Descrizione: 'Ammorbidente 1L',     Anno: 2026, Mese: 4,  Brand: 'CasaPulita', Categoria: 'Cura Casa', Sottocategoria: 'Detersivi', Formato: '1L',    Paese: 'IT', Canale: 'GDO', Quantita: 2500, PrezzoUnitario: 2.60, CostoUnitario: 1.15 },

  // ── REF-013  Crema Viso SPF50 50ml (high margin beauty)
  { Referenza: 'REF-013', Descrizione: 'Crema Viso SPF50 50ml', Anno: 2025, Mese: 3, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Viso', Formato: '50ml', Paese: 'IT', Canale: 'Farmacia', Quantita: 980, PrezzoUnitario: 22.00, CostoUnitario: 7.50 },
  { Referenza: 'REF-013', Descrizione: 'Crema Viso SPF50 50ml', Anno: 2025, Mese: 9, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Viso', Formato: '50ml', Paese: 'IT', Canale: 'Farmacia', Quantita: 1200, PrezzoUnitario: 22.00, CostoUnitario: 7.50 },
  { Referenza: 'REF-013', Descrizione: 'Crema Viso SPF50 50ml', Anno: 2026, Mese: 3, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Viso', Formato: '50ml', Paese: 'IT', Canale: 'Farmacia', Quantita: 1050, PrezzoUnitario: 24.00, CostoUnitario: 8.00 },
  { Referenza: 'REF-013', Descrizione: 'Crema Viso SPF50 50ml', Anno: 2026, Mese: 9, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Viso', Formato: '50ml', Paese: 'IT', Canale: 'Farmacia', Quantita: 1380, PrezzoUnitario: 24.00, CostoUnitario: 8.00 },

  // ── REF-014  Shampoo Nutriente 250ml
  { Referenza: 'REF-014', Descrizione: 'Shampoo Nutriente 250ml', Anno: 2025, Mese: 2, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Capelli', Formato: '250ml', Paese: 'IT', Canale: 'GDO', Quantita: 2700, PrezzoUnitario: 5.80, CostoUnitario: 2.10 },
  { Referenza: 'REF-014', Descrizione: 'Shampoo Nutriente 250ml', Anno: 2026, Mese: 2, Brand: 'BellaPelle', Categoria: 'Cura Persona', Sottocategoria: 'Capelli', Formato: '250ml', Paese: 'IT', Canale: 'GDO', Quantita: 2900, PrezzoUnitario: 6.20, CostoUnitario: 2.20 },

  // ── REF-015  Integratore Vitamina C 60cps (new launch 2026 only)
  { Referenza: 'REF-015', Descrizione: 'Integratore Vitamina C 60cps', Anno: 2026, Mese: 1, Brand: 'VitaPlus', Categoria: 'Cura Persona', Sottocategoria: 'Integratori', Formato: '60cps', Paese: 'IT', Canale: 'Farmacia', Quantita: 520, PrezzoUnitario: 18.00, CostoUnitario: 6.00 },
  { Referenza: 'REF-015', Descrizione: 'Integratore Vitamina C 60cps', Anno: 2026, Mese: 5, Brand: 'VitaPlus', Categoria: 'Cura Persona', Sottocategoria: 'Integratori', Formato: '60cps', Paese: 'IT', Canale: 'Farmacia', Quantita: 840, PrezzoUnitario: 18.00, CostoUnitario: 6.00 },

  // ── REF-016  Biscotti Avena 400g
  { Referenza: 'REF-016', Descrizione: 'Biscotti Avena 400g', Anno: 2025, Mese: 6,  Brand: 'NaturaBio', Categoria: 'Alimentari', Sottocategoria: 'Dolciumi', Formato: '400g', Paese: 'IT', Canale: 'GDO',    Quantita: 1600, PrezzoUnitario: 2.90, CostoUnitario: 1.20 },
  { Referenza: 'REF-016', Descrizione: 'Biscotti Avena 400g', Anno: 2026, Mese: 6,  Brand: 'NaturaBio', Categoria: 'Alimentari', Sottocategoria: 'Dolciumi', Formato: '400g', Paese: 'IT', Canale: 'GDO',    Quantita: 1850, PrezzoUnitario: 3.10, CostoUnitario: 1.25 },

  // ── REF-017  Yogurt Bianco 125g x4 (discontinued end 2025)
  { Referenza: 'REF-017', Descrizione: 'Yogurt Bianco 125g x4', Anno: 2025, Mese: 1, Brand: 'LatteFresc', Categoria: 'Alimentari', Sottocategoria: 'Latticini', Formato: '4x125g', Paese: 'IT', Canale: 'GDO', Quantita: 5200, PrezzoUnitario: 1.20, CostoUnitario: 0.75 },
  { Referenza: 'REF-017', Descrizione: 'Yogurt Bianco 125g x4', Anno: 2025, Mese: 6, Brand: 'LatteFresc', Categoria: 'Alimentari', Sottocategoria: 'Latticini', Formato: '4x125g', Paese: 'IT', Canale: 'GDO', Quantita: 4800, PrezzoUnitario: 1.20, CostoUnitario: 0.75 },

  // ── REF-018  Vino Rosso DOC 750ml (export + GDO)
  { Referenza: 'REF-018', Descrizione: 'Vino Rosso DOC 750ml', Anno: 2025, Mese: 10, Brand: 'CollinaD\'Oro', Categoria: 'Bevande', Sottocategoria: 'Vini', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 2400, PrezzoUnitario: 7.50, CostoUnitario: 3.10 },
  { Referenza: 'REF-018', Descrizione: 'Vino Rosso DOC 750ml', Anno: 2025, Mese: 10, Brand: 'CollinaD\'Oro', Categoria: 'Bevande', Sottocategoria: 'Vini', Formato: '750ml', Paese: 'FR', Canale: 'Export',  Quantita: 800,  PrezzoUnitario: 9.00, CostoUnitario: 3.10 },
  { Referenza: 'REF-018', Descrizione: 'Vino Rosso DOC 750ml', Anno: 2026, Mese: 10, Brand: 'CollinaD\'Oro', Categoria: 'Bevande', Sottocategoria: 'Vini', Formato: '750ml', Paese: 'IT', Canale: 'GDO',    Quantita: 2700, PrezzoUnitario: 8.00, CostoUnitario: 3.30 },
  { Referenza: 'REF-018', Descrizione: 'Vino Rosso DOC 750ml', Anno: 2026, Mese: 10, Brand: 'CollinaD\'Oro', Categoria: 'Bevande', Sottocategoria: 'Vini', Formato: '750ml', Paese: 'FR', Canale: 'Export',  Quantita: 1100, PrezzoUnitario: 9.50, CostoUnitario: 3.30 },

  // ── REF-019  Snack Proteico 45g (growing trend)
  { Referenza: 'REF-019', Descrizione: 'Snack Proteico 45g',  Anno: 2025, Mese: 3,  Brand: 'VitaPlus', Categoria: 'Alimentari', Sottocategoria: 'Snack', Formato: '45g',   Paese: 'IT', Canale: 'Farmacia',Quantita: 740,  PrezzoUnitario: 3.50, CostoUnitario: 1.40 },
  { Referenza: 'REF-019', Descrizione: 'Snack Proteico 45g',  Anno: 2026, Mese: 3,  Brand: 'VitaPlus', Categoria: 'Alimentari', Sottocategoria: 'Snack', Formato: '45g',   Paese: 'IT', Canale: 'Farmacia',Quantita: 1300, PrezzoUnitario: 3.70, CostoUnitario: 1.45 },

  // ── REF-020  Sapone Mani 300ml
  { Referenza: 'REF-020', Descrizione: 'Sapone Mani 300ml',   Anno: 2025, Mese: 5,  Brand: 'CasaPulita', Categoria: 'Cura Persona', Sottocategoria: 'Igiene', Formato: '300ml', Paese: 'IT', Canale: 'GDO', Quantita: 3100, PrezzoUnitario: 2.10, CostoUnitario: 0.90 },
  { Referenza: 'REF-020', Descrizione: 'Sapone Mani 300ml',   Anno: 2026, Mese: 5,  Brand: 'CasaPulita', Categoria: 'Cura Persona', Sottocategoria: 'Igiene', Formato: '300ml', Paese: 'IT', Canale: 'GDO', Quantita: 3400, PrezzoUnitario: 2.20, CostoUnitario: 0.93 },
];

// ─── Balance mock data — two years for trend comparison ───────────────────────

export const mockBalanceData: BalanceData = {
  years: [
    {
      anno: 2025,
      ricavi: 4_850_000,
      costoDelVenduto: 2_620_000,
      costiOperativi: 980_000,
      ammortamenti: 140_000,
      oneriFinanziari: 95_000,
      imposte: 210_000,

      attivoCorriente: 1_920_000,
      magazzino: 380_000,
      creditiClienti: 870_000,
      liquidita: 670_000,
      debitiFinanziariBT: 600_000,
      debitiFinanziariLT: 600_000,
      patrimoniNetto: 1_650_000,
      debitiFornitori: 530_000,
      totaleAttivo: 4_020_000,
      passivoCorriente: 1_170_000,
      capex: 0,
    },
    {
      anno: 2026,
      ricavi: 5_310_000,
      costoDelVenduto: 2_830_000,
      costiOperativi: 1_020_000,
      ammortamenti: 155_000,
      oneriFinanziari: 88_000,
      imposte: 248_000,

      attivoCorriente: 2_150_000,
      magazzino: 410_000,
      creditiClienti: 940_000,
      liquidita: 800_000,
      debitiFinanziariBT: 500_000,
      debitiFinanziariLT: 550_000,
      patrimoniNetto: 1_920_000,
      debitiFornitori: 580_000,
      totaleAttivo: 4_230_000,
      passivoCorriente: 1_260_000,
      capex: 0,
    },
  ],

  kpis: [
    {
      anno: 2025,
      ebitda: 1_250_000, ebitdaPerc: 25.8,
      ebit: 1_110_000,   ebitPerc: 22.9,
      utileNetto: 805_000, utileNettoPerc: 16.6,
      roe: 48.8, roi: 26.5,
      currentRatio: 1.64, quickRatio: 1.31, cashRatio: 0.57,
      pfn: 530_000, pfnEbitda: 0.42, debtToEquity: 0.73,
      dso: 65, dio: 53, dpo: 74, ccc: 44,
    },
    {
      anno: 2026,
      ebitda: 1_460_000, ebitdaPerc: 27.5,
      ebit: 1_305_000,   ebitPerc: 24.6,
      utileNetto: 969_000, utileNettoPerc: 18.2,
      roe: 50.5, roi: 29.8,
      currentRatio: 1.71, quickRatio: 1.38, cashRatio: 0.63,
      pfn: 250_000, pfnEbitda: 0.17, debtToEquity: 0.55,
      dso: 64, dio: 53, dpo: 75, ccc: 42,
    },
  ],
};
