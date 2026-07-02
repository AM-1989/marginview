/**
 * Standalone test for computeMixDecomposition using a provided XLSX file.
 * Usage: node test-mix-decomp.mjs <path-to-file.xlsx>
 *
 * Reads the file, filters to Maggio 2025 (P1) and Maggio 2026 (P2),
 * then prints the full mix decomposition to stdout.
 */

import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node test-mix-decomp.mjs <path-to-file.xlsx>');
  process.exit(1);
}

// ── inline helpers ────────────────────────────────────────────────────────────

function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  let s = String(v).replace(/[€\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',') && !s.includes('.'))  s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

const MONTH_NAMES = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function parseMese(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'number') { const n = Math.round(v); return n >= 1 && n <= 12 ? n : 1; }
  const s = String(v).trim();
  const byName = MONTH_NAMES.findIndex(m => m.toLowerCase() === s.toLowerCase());
  if (byName > 0) return byName;
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return Math.round(n);
  const m = s.match(/^\d{4}-(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  return 1;
}

const COL_ALIASES = {
  codiceMateriale: ['codice referenza/servizio','codice referenza / servizio','codice materiale','codice referenza','codice','sku','articolo','cod. art.','codice art','id','referenza','codice prodotto'],
  descrizione:     ['descrizione referenza/servizio','descrizione referenza / servizio','descrizione materiale','descrizione referenza','descrizione','nome','prodotto','description','product','nome prodotto'],
  brand:           ['brand','marca'],
  categoria:       ['categoria','category','famiglia','famiglia prodotto'],
  sottocategoria:  ['sottocategoria','subcategory','sub categoria','sub-categoria'],
  formato:         ['formato','format','pack','confezione'],
  anno:            ['anno','year','esercizio','anno competenza','anno di competenza'],
  mese:            ['mese','month','mese competenza','mese di competenza'],
  quantita:        ['quantità venduta','quantita venduta','quantità','quantita','qty','quantity','pezzi','volume'],
  fatturato:       ['fatturato','ricavi','vendite','revenue','sales','fatturato netto','importo','ricavo','totale fatturato','ricavi netti'],
  costoUnitario:   ['costo unitario/tariffa','costo unitario / tariffa','costo unitario','tariffa','costo medio','unit cost','unitcost','costo unit.','costo/unità','costo/unita','costo per unità','costo per pezzo'],
  costoTotaleCol:  ['costo totale','costi totali','total cost','costo','costi','totale costi','costo variabile totale'],
};

function findCol(headers, aliases) {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase().trim());
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

// ── load file ─────────────────────────────────────────────────────────────────

const wb  = read(readFileSync(filePath));
const ws  = wb.Sheets[wb.SheetNames[0]];
const raw = utils.sheet_to_json(ws);

if (!raw.length) { console.error('Empty sheet'); process.exit(1); }
const headers = Object.keys(raw[0]).map(h => String(h).trim());

const cols = {};
for (const [field, aliases] of Object.entries(COL_ALIASES)) {
  cols[field] = findCol(headers, aliases);
}
console.log('Columns mapped:', JSON.stringify(cols, null, 2));

const get = (r, field) => cols[field] ? r[cols[field]] : undefined;

const hasCostoUnit = !!cols['costoUnitario'];
const hasCostoTot  = !!cols['costoTotaleCol'];
const useTotalCost = !hasCostoUnit && hasCostoTot;

const allRows = raw.flatMap((r, i) => {
  const quantita  = parseNum(get(r, 'quantita'));
  const fatturato = parseNum(get(r, 'fatturato'));
  if (fatturato === 0 && quantita === 0) return [];
  let costoUnitario, costoTotale;
  if (useTotalCost) {
    costoTotale   = parseNum(get(r, 'costoTotaleCol'));
    costoUnitario = quantita > 0 ? costoTotale / quantita : 0;
  } else {
    costoUnitario = parseNum(get(r, 'costoUnitario'));
    costoTotale   = costoUnitario * quantita;
  }
  return [{
    codiceMateriale: String(get(r,'codiceMateriale') ?? `R${i+1}`).trim(),
    descrizione:     String(get(r,'descrizione')     ?? '').trim(),
    brand:           String(get(r,'brand')           ?? '').trim(),
    categoria:       String(get(r,'categoria')       ?? '').trim(),
    sottocategoria:  String(get(r,'sottocategoria')  ?? '').trim(),
    formato:         String(get(r,'formato')         ?? '').trim(),
    anno:            parseNum(get(r,'anno')) || new Date().getFullYear(),
    mese:            parseMese(get(r,'mese')),
    quantita, fatturato, costoUnitario, costoTotale,
  }];
});

console.log(`Total rows: ${allRows.length}`);
const years  = [...new Set(allRows.map(r => r.anno))].sort();
const months = [...new Set(allRows.map(r => r.mese))].sort((a,b)=>a-b);
console.log('Years available:', years);
console.log('Months available:', months.map(m => `${m} (${MONTH_NAMES[m]})`));

// ── filter to Maggio ──────────────────────────────────────────────────────────

const rowsP1 = allRows.filter(r => r.anno === 2025 && r.mese === 5);
const rowsP2 = allRows.filter(r => r.anno === 2026 && r.mese === 5);

console.log(`\nMaggio 2025 (P1): ${rowsP1.length} rows`);
console.log(`Maggio 2026 (P2): ${rowsP2.length} rows`);

if (!rowsP1.length && !rowsP2.length) {
  console.error('No data for Maggio 2025 or 2026. Check years/months available above.');
  process.exit(1);
}

// ── aggregatePeriod ───────────────────────────────────────────────────────────

function buildKeyFn(allRows) {
  const codeToDescs = new Map();
  for (const r of allRows) {
    const code = r.codiceMateriale.trim().toLowerCase();
    if (code) {
      if (!codeToDescs.has(code)) codeToDescs.set(code, new Set());
      codeToDescs.get(code).add(r.descrizione.trim().toLowerCase());
    }
  }
  return (row) => {
    const code = row.codiceMateriale.trim();
    const desc = row.descrizione.trim();
    if (!code) return desc || '_unknown_';
    const descs = codeToDescs.get(code.toLowerCase());
    const isUnique = !descs || descs.size <= 1;
    return isUnique ? code : (desc ? `${code} | ${desc}` : code);
  };
}

function aggregatePeriod(rows, getKey) {
  const map = new Map();
  for (const r of rows) {
    const k = getKey(r);
    if (!map.has(k)) {
      map.set(k, { codice: r.codiceMateriale, descrizione: r.descrizione,
        brand: r.brand, categoria: r.categoria, sottocategoria: r.sottocategoria,
        formato: r.formato, q: 0, rev: 0, cost: 0 });
    }
    const a = map.get(k);
    a.q    += r.quantita;
    a.rev  += r.fatturato;
    a.cost += r.costoTotale;
    if (!a.brand          && r.brand)          a.brand          = r.brand;
    if (!a.categoria      && r.categoria)      a.categoria      = r.categoria;
    if (!a.sottocategoria && r.sottocategoria) a.sottocategoria = r.sottocategoria;
    if (!a.formato        && r.formato)        a.formato        = r.formato;
  }
  return map;
}

// ── fullOuterJoin ─────────────────────────────────────────────────────────────

function fullOuterJoin(agg1, agg2) {
  const allKeys = new Set([...agg1.keys(), ...agg2.keys()]);
  const lines = [];
  for (const key of allKeys) {
    const d1 = agg1.get(key), d2 = agg2.get(key);
    const meta = (d1 ?? d2);
    const q1 = d1?.q ?? 0, rev1 = d1?.rev ?? 0, cost1 = d1?.cost ?? 0;
    const q2 = d2?.q ?? 0, rev2 = d2?.rev ?? 0, cost2 = d2?.cost ?? 0;
    const price1Raw    = q1 > 0 ? rev1  / q1 : null;
    const unitCost1Raw = q1 > 0 ? cost1 / q1 : null;
    const price2Raw    = q2 > 0 ? rev2  / q2 : null;
    const unitCost2Raw = q2 > 0 ? cost2 / q2 : null;
    const price1Effective    = price1Raw    ?? price2Raw    ?? 0;
    const unitCost1Effective = unitCost1Raw ?? unitCost2Raw ?? 0;
    lines.push({ key, ...meta, q1, rev1, cost1, q2, rev2, cost2,
      price1Effective, unitCost1Effective, mix1: 0, mix2: 0 });
  }
  return lines;
}

// ── main calculation ──────────────────────────────────────────────────────────

const getKey = buildKeyFn([...rowsP1, ...rowsP2]);
const agg1   = aggregatePeriod(rowsP1, getKey);
const agg2   = aggregatePeriod(rowsP2, getKey);
const lines  = fullOuterJoin(agg1, agg2);

const Q1 = lines.reduce((s,l) => s+l.q1, 0);
const Q2 = lines.reduce((s,l) => s+l.q2, 0);
for (const l of lines) { l.mix1 = Q1>0 ? l.q1/Q1 : 0; l.mix2 = Q2>0 ? l.q2/Q2 : 0; }

const totalRev1  = lines.reduce((s,l) => s+l.rev1,  0);
const totalRev2  = lines.reduce((s,l) => s+l.rev2,  0);
const totalCost1 = lines.reduce((s,l) => s+l.cost1, 0);
const totalCost2 = lines.reduce((s,l) => s+l.cost2, 0);
const mpctP1 = totalRev1 > 0 ? (totalRev1 - totalCost1) / totalRev1 : 0;
const mpctP2 = totalRev2 > 0 ? (totalRev2 - totalCost2) / totalRev2 : 0;

// Scenario V (volume)
let revV=0, costV=0;
for (const l of lines) { const qV = Q2*(l.q1/Q1||0); revV += qV*l.price1Effective; costV += qV*l.unitCost1Effective; }
const mpctV = revV > 0 ? (revV-costV)/revV : mpctP1;

// Scenario M (mix)
let revM=0, costM=0;
for (const l of lines) { revM += l.q2*l.price1Effective; costM += l.q2*l.unitCost1Effective; }
const mpctM = revM > 0 ? (revM-costM)/revM : mpctV;

const effVolume = mpctV - mpctP1;
const effMix    = mpctM - mpctV;

// Scenario P (price) — totalRev2 uses actual prices
let costP=0; for (const l of lines) costP += l.q2*l.unitCost1Effective;
const mpctP = totalRev2 > 0 ? (totalRev2-costP)/totalRev2 : mpctM;
const effPrezzo = mpctP - mpctM;
const effCosto  = mpctP2 - mpctP;

console.log('\n─── KPIs ────────────────────────────────────────────────────');
console.log(`marginPctP1  : ${(mpctP1*100).toFixed(4)} %`);
console.log(`marginPctP2  : ${(mpctP2*100).toFixed(4)} %`);
console.log(`effVolume    : ${(effVolume*100).toFixed(4)} pp`);
console.log(`effMix       : ${(effMix*100).toFixed(4)} pp`);
console.log(`effPrezzo    : ${(effPrezzo*100).toFixed(4)} pp`);
console.log(`effCosto     : ${(effCosto*100).toFixed(4)} pp`);
const expectedP2 = mpctP1+effVolume+effMix+effPrezzo+effCosto;
console.log(`expectedP2   : ${(expectedP2*100).toFixed(4)} %  (diff ${((mpctP2-expectedP2)*100).toFixed(6)} pp)`);

// ── Mix decomposition ─────────────────────────────────────────────────────────

function buildScenario(lines, groupKey) {
  const groupQ1 = new Map(), groupQ2 = new Map();
  for (const l of lines) {
    const k = groupKey(l);
    groupQ1.set(k, (groupQ1.get(k)??0) + l.q1);
    groupQ2.set(k, (groupQ2.get(k)??0) + l.q2);
  }
  let revS=0, costS=0;
  for (const l of lines) {
    const k   = groupKey(l);
    const Q1g = groupQ1.get(k);
    const Q2g = groupQ2.get(k);
    const qS  = Q1g > 0 ? Q2g * (l.q1 / Q1g) : l.q2;
    revS  += qS * l.price1Effective;
    costS += qS * l.unitCost1Effective;
  }
  return revS > 0 ? (revS-costS)/revS : mpctV;
}

const mpctBrand   = buildScenario(lines, l => l.brand    || 'N/D');
const mpctCat     = buildScenario(lines, l => `${l.brand||'N/D'}|${l.categoria||'N/D'}`);
const mpctSubCat  = buildScenario(lines, l => `${l.brand||'N/D'}|${l.categoria||'N/D'}|${l.sottocategoria||'N/D'}`);
const mpctFormato = buildScenario(lines, l => `${l.brand||'N/D'}|${l.categoria||'N/D'}|${l.sottocategoria||'N/D'}|${l.formato||'N/D'}`);

const brand         = mpctBrand   - mpctV;
const categoria     = mpctCat     - mpctBrand;
const sottocategoria = mpctSubCat - mpctCat;
const formato       = mpctFormato - mpctSubCat;
const residuo       = mpctM       - mpctFormato;
const totale        = brand + categoria + sottocategoria + formato + residuo;
const balanceErr    = Math.abs(totale - effMix);

console.log('\n─── mixDecomposition ────────────────────────────────────────');
console.log(`brand          : ${(brand*100).toFixed(4)} pp`);
console.log(`categoria      : ${(categoria*100).toFixed(4)} pp`);
console.log(`sottocategoria : ${(sottocategoria*100).toFixed(4)} pp`);
console.log(`formato        : ${(formato*100).toFixed(4)} pp`);
console.log(`residuo        : ${(residuo*100).toFixed(4)} pp`);
console.log(`─────────────────────────────────────────────────────────────`);
console.log(`TOTALE         : ${(totale*100).toFixed(4)} pp`);
console.log(`effMix         : ${(effMix*100).toFixed(4)} pp`);
console.log(`balance error  : ${(balanceErr*100).toFixed(6)} pp  ${balanceErr <= 0.001 ? '✓ OK' : '⚠ WARNING'}`);
