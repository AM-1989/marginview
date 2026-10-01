import ExcelJS from 'exceljs';
import type { ClassifiedRow, SegmentKey } from './abcMatrixCalc';

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY       = 'FF1E2761';   // header bg (from template)
const WHITE      = 'FFFFFFFF';

// ABC: row bg by segment column (A=green pastel, B=neutral, C=red pastel)
const SEG_ROW_BG: Record<SegmentKey, string> = {
  AA: 'FFE8F3ED', AB: 'FFF5F6FA', AC: 'FFFBEAE8',
  BA: 'FFE8F3ED', BB: 'FFF5F6FA', BC: 'FFFBEAE8',
  CA: 'FFE8F3ED', CB: 'FFF5F6FA', CC: 'FFFBEAE8',
};

// Variance: row bg by hierarchy level
const VAR_LEVEL_BG: Record<string, string> = {
  TOTALE:         NAVY,
  CANALE:         'FFE8EDF4',
  Brand:          'FFF0F4F8',
  Categoria:      'FFF8FAFC',
  Sottocategoria: 'FFFFFFFF',
  Referenza:      'FFFFFFFF',
};
const VAR_LEVEL_FONT: Record<string, string> = {
  TOTALE:         WHITE,
  CANALE:         'FF1E2761',
  Brand:          'FF334155',
  Categoria:      'FF475569',
  Sottocategoria: 'FF64748B',
  Referenza:      'FF64748B',
};
const VAR_LEVEL_BOLD: Record<string, boolean> = {
  TOTALE: true, CANALE: true, Brand: true,
  Categoria: false, Sottocategoria: false, Referenza: false,
};

// ── Cell style helpers ────────────────────────────────────────────────────────

function applyHeaderCell(cell: ExcelJS.Cell) {
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.font      = { bold: true, size: 9, name: 'Calibri', color: { argb: WHITE } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border    = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
}

function applyTitleCell(cell: ExcelJS.Cell) {
  cell.font      = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF1E2761' } };
  cell.alignment = { vertical: 'middle' };
}

function applySubtitleCell(cell: ExcelJS.Cell) {
  cell.font      = { size: 9, name: 'Calibri', color: { argb: 'FF64748B' } };
  cell.alignment = { vertical: 'middle' };
}

function applyDataCell(
  cell: ExcelJS.Cell,
  bgArgb: string,
  fontArgb: string,
  bold: boolean,
) {
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
  cell.font      = { size: 9, name: 'Calibri', color: { argb: fontArgb }, bold };
  cell.alignment = { vertical: 'middle' };
  cell.border    = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
}

// ── Browser download ──────────────────────────────────────────────────────────

async function triggerDownload(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── ABC Matrix export ─────────────────────────────────────────────────────────

export async function exportABCToExcel(
  products:    ClassifiedRow[],
  hasGiacenza: boolean,
): Promise<void> {
  const ORDER: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const sorted = [...products].sort((a, b) => {
    const si = ORDER.indexOf(a.segment) - ORDER.indexOf(b.segment);
    return si !== 0 ? si : b.revenue - a.revenue;
  });

  const rotLabel = (p: ClassifiedRow): string => {
    if (!p.ratingRotazione) return '-';
    const desc = p.ratingRotazione === 'A' ? 'veloce' : p.ratingRotazione === 'B' ? 'media' : 'lenta';
    return `${p.ratingRotazione} · ${desc}`;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Marginview';
  wb.modified = new Date();
  const ws    = wb.addWorksheet('Tutti i codici');

  // ── Columns ─────────────────────────────────────────────────────────────────
  const baseCols: Partial<ExcelJS.Column>[] = [
    { header: 'Codice',                 width: 14 },
    { header: 'Descrizione',            width: 40 },
    { header: 'Brand',                  width: 16 },
    { header: 'Categoria',              width: 22 },
    { header: 'Fatturato',              width: 15 },
    { header: 'Margine %',              width: 10 },
    { header: 'Margine (€)',            width: 13 },
    { header: 'Rating Fatturato',       width: 15 },
    { header: 'Rating Margine',         width: 15 },
    { header: 'Blocco (Fatt.×Marg.)',   width: 16 },
  ];
  const giaCols: Partial<ExcelJS.Column>[] = [
    { header: 'Rating Rotazione',        width: 14 },
    { header: 'Giacenza magazzino (€)',  width: 16 },
    { header: 'Rating complessivo',      width: 16 },
  ];
  ws.columns = hasGiacenza ? [...baseCols, ...giaCols] : baseCols;

  const totalCols  = hasGiacenza ? 13 : 10;
  const lastColLtr = colLetter(totalCols);

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  ws.addRow([`Tutti i codici · elenco completo con rating · ${products.length} codici`]);
  ws.getRow(1).height = 25.5;
  ws.mergeCells(`A1:${lastColLtr}1`);
  applyTitleCell(ws.getCell('A1'));

  // ── Row 2: Subtitle ──────────────────────────────────────────────────────────
  ws.addRow([`Ordinato per blocco Fatturato×Margine (AA → CC) e, all'interno di ognuno, per fatturato decrescente.`]);
  ws.getRow(2).height = 15.75;
  ws.mergeCells(`A2:${lastColLtr}2`);
  applySubtitleCell(ws.getCell('A2'));

  // ── Row 3: Header ────────────────────────────────────────────────────────────
  const headers = (ws.columns as ExcelJS.Column[]).map(c => c.header as string);
  ws.addRow(headers);
  ws.getRow(3).height = 27.75;
  ws.getRow(3).eachCell(cell => applyHeaderCell(cell));

  // ── Data rows (from row 4) ───────────────────────────────────────────────────
  for (const p of sorted) {
    const rowValues: (string | number)[] = [
      p.id       || '-',
      p.name     || '-',
      p.brand    || '-',
      p.category || '-',
      p.revenue,
      p.marginPct / 100,   // stored as decimal for % format
      p.profit,
      p.ratingRevenue,
      p.ratingMargin,
      p.segment,
    ];
    if (hasGiacenza) {
      rowValues.push(
        rotLabel(p),
        typeof p.giacenza === 'number' ? p.giacenza : '-',
        p.ratingComplessivo ?? '-',
      );
    }

    const dr = ws.addRow(rowValues);
    dr.height = 16;
    const bg = SEG_ROW_BG[p.segment];

    dr.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > totalCols) return;
      applyDataCell(cell, bg, 'FF1E293B', false);
      cell.alignment = { vertical: 'middle', horizontal: col >= 5 && col <= 7 ? 'right' : 'left' };
    });

    dr.getCell(5).numFmt = '#,##0';     // Fatturato
    dr.getCell(6).numFmt = '0.0%';      // Margine %
    dr.getCell(7).numFmt = '#,##0';     // Margine (€)
    if (hasGiacenza) {
      const giacCell = dr.getCell(12);
      if (typeof p.giacenza === 'number') giacCell.numFmt = '#,##0';
    }
  }

  // ── Freeze pane at row 4 ─────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activeCell: 'A4' }];

  await triggerDownload(wb, 'analisi-abc.xlsx');
}

// ── Variance Bridge export ────────────────────────────────────────────────────

export interface VarianceBridgeRow {
  Livello:       string;
  Etichetta:     string;
  'Cos% P1':     string;
  Volume:        string;
  'Mix Canale':  string;
  'Mix Brand':   string;
  'Mix Cat.':    string;
  'Mix Sottocat.': string;
  'Mix Ref.':    string;
  Price:         string;
  Costo:         string;
  'Cos% P2':     string;
}

export async function exportVarianceToExcel(
  rows:     VarianceBridgeRow[],
  p1Label:  string,
  p2Label:  string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Marginview';
  wb.modified = new Date();
  const ws    = wb.addWorksheet('Bridge');

  ws.columns = [
    { header: 'Livello',         width: 14 },
    { header: 'Etichetta',       width: 40 },
    { header: 'Cos% P1',         width: 10 },
    { header: 'Volume',          width: 10 },
    { header: 'Mix Canale',      width: 11 },
    { header: 'Mix Brand',       width: 11 },
    { header: 'Mix Cat.',        width: 11 },
    { header: 'Mix Sottocat.',   width: 12 },
    { header: 'Mix Ref.',        width: 11 },
    { header: 'Price',           width: 10 },
    { header: 'Costo',           width: 10 },
    { header: 'Cos% P2',         width: 10 },
  ];

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  ws.addRow([`Analisi Varianza Margine — Effetti sul Bridge`]);
  ws.getRow(1).height = 25.5;
  ws.mergeCells('A1:L1');
  applyTitleCell(ws.getCell('A1'));

  // ── Row 2: Subtitle ──────────────────────────────────────────────────────────
  ws.addRow([`${p1Label} → ${p2Label}  ·  ${rows.length} righe`]);
  ws.getRow(2).height = 15.75;
  ws.mergeCells('A2:L2');
  applySubtitleCell(ws.getCell('A2'));

  // ── Row 3: Header ────────────────────────────────────────────────────────────
  const headers = (ws.columns as ExcelJS.Column[]).map(c => c.header as string);
  ws.addRow(headers);
  ws.getRow(3).height = 27.75;
  ws.getRow(3).eachCell(cell => applyHeaderCell(cell));

  // ── Data rows ────────────────────────────────────────────────────────────────
  for (const row of rows) {
    const dr       = ws.addRow(Object.values(row));
    dr.height      = 16;
    const livello  = row.Livello;
    const bg       = VAR_LEVEL_BG[livello]   ?? 'FFFFFFFF';
    const fontClr  = VAR_LEVEL_FONT[livello] ?? 'FF334155';
    const bold     = VAR_LEVEL_BOLD[livello] ?? false;

    dr.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 12) return;
      applyDataCell(cell, bg, fontClr, bold);
      cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'right' : 'left' };
    });
  }

  // ── Freeze pane at row 4 ─────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activeCell: 'A4' }];

  await triggerDownload(wb, 'varianza-bridge.xlsx');
}

// ── Utility ───────────────────────────────────────────────────────────────────
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(64 + (n % 26 || 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
