import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { BalanceKPI, BalanceInputYear } from '../../types';
import { C, base, fmtPct, fmtEur, fmtX, today } from './pdfTheme';

export interface BalancePDFProps {
  kpis:           BalanceKPI[];
  inputs?:        BalanceInputYear[];
  selKpi:         BalanceKPI;
  selInput:       BalanceInputYear;
  aiComment:      string | null;
  consultantNote: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Revenue + KPI rows (flex: 1 per card, gap on container)
  cardRow:   { flexDirection: 'row', gap: 6 },
  card5:     { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 9 },
  kpiLabel:  { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  kpiVal:    { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  kpiSub:    { fontSize: 6.5, color: C.slate5 },
  kpiCtx:    { fontSize: 6, color: C.slate4, marginTop: 2 },

  // Indicator table rows
  indTable:  { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' },
  indHead:   { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 5, paddingHorizontal: 10 },
  indHCell:  { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase' },
  indRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.slate1 },
  indAlt:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.slate1, backgroundColor: C.bg },
  indLabel:  { flex: 1, fontSize: 7, color: C.slate7 },
  indVal:    { width: 60, textAlign: 'right', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  indBench:  { width: 72, textAlign: 'right', fontSize: 6.5, color: C.slate4 },
  indCtx:    { width: 118, textAlign: 'right', fontSize: 6, color: C.slate4 },

  // Trend bars
  trendSection: { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 12 },
  trendRow:     { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: C.slate1 },
  trendLabel:   { width: 75, fontSize: 7, color: C.slate6, paddingTop: 22 },
  trendYearCol: { alignItems: 'center', marginRight: 6 },
  trendYearVal: { fontSize: 6, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  trendYearLbl: { fontSize: 5.5, color: C.slate4, marginTop: 2 },

  // Balance sheet
  bsCard:   { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10 },
  bsTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  bsRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.slate1 },

  // Comments
  aiBlock:   { backgroundColor: C.dark, borderRadius: 8, padding: 12 },
  aiTitle:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 6 },
  aiText:    { fontSize: 7, color: '#94a3b8', lineHeight: 1.6 },
  noteBlock: { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 12 },
  noteTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6 },
  noteText:  { fontSize: 7, color: C.slate6, lineHeight: 1.6 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function kpiColor(key: string, v: number): string {
  const t: Record<string, [number, number]> = {
    ebitdaPerc:    [5, 15], ebitPerc:      [2, 10],
    utileNettoPerc:[1, 7],  roe:           [5, 15],
    roi:           [3, 10], currentRatio:  [1.0, 1.5],
    pfnEbitda:     [3, 5],  ccc:           [60, 90],
  };
  const th = t[key];
  if (!th) return C.slate7;
  const inv = key === 'pfnEbitda' || key === 'ccc';
  if (inv) return v <= th[0] ? C.emerald : v <= th[1] ? C.amber : C.red;
  return v >= th[1] ? C.emerald : v >= th[0] ? C.amber : C.red;
}

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const W = 26; const H = 30;
  const barH = max > 0 ? Math.max(2, (Math.abs(value) / max) * (H - 4)) : 2;
  return (
    <Svg width={W} height={H}>
      <Rect x={3} y={0} width={W - 6} height={H} fill={C.slate1} rx={2} />
      <Rect x={3} y={H - barH} width={W - 6} height={barH} fill={color} rx={2} />
    </Svg>
  );
}

function PdfHeader({ anno }: { anno: number }) {
  return (
    <View style={base.header}>
      <View style={base.headerLeft}>
        <Text style={base.headerBrand}>MARGINVIEW</Text>
        <Text style={base.headerTitle}>Analisi di Bilancio {anno}</Text>
        <Text style={base.headerSub}>KPI Finanziari · Redditività, Liquidità, Leva, Ciclo del Capitale</Text>
      </View>
      <View style={base.headerRight}>
        <Text style={base.headerDate}>{today()}</Text>
      </View>
    </View>
  );
}

function PdfFooter({ anno }: { anno: number }) {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Analisi Bilancio {anno} — Documento riservato</Text>
      <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function BalancePDF({ kpis, selKpi, selInput, aiComment, consultantNote }: BalancePDFProps) {
  const anno = selKpi.anno;

  const trendKpis: { label: string; key: keyof BalanceKPI; fmt: (v: number) => string }[] = [
    { label: 'EBITDA %',   key: 'ebitdaPerc', fmt: fmtPct },
    { label: 'ROE',        key: 'roe',        fmt: fmtPct },
    { label: 'PFN/EBITDA', key: 'pfnEbitda',  fmt: fmtX  },
    { label: 'CCC (gg)',   key: 'ccc',        fmt: v => `${v.toFixed(0)}` },
  ];

  return (
    <Document>

      {/* ── PAGE 1: KPIs ──────────────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader anno={anno} />

        <View style={base.body}>

          {/* Conto Economico strip — 5 card flex:1 */}
          <Text style={base.sectionLabel}>Conto Economico Sintesi — {anno}</Text>
          <View style={S.cardRow}>
            {([
              { label: 'Ricavi',         val: fmtEur(selInput.ricavi),         clr: C.dark },
              { label: 'EBITDA',         val: fmtEur(selKpi.ebitda),           clr: kpiColor('ebitdaPerc', selKpi.ebitdaPerc) },
              { label: 'EBIT',           val: fmtEur(selKpi.ebit),             clr: kpiColor('ebitPerc', selKpi.ebitPerc) },
              { label: 'Utile Netto',    val: fmtEur(selKpi.utileNetto),       clr: selKpi.utileNetto >= 0 ? C.emerald : C.red },
              { label: 'Free Cash Flow', val: fmtEur(selKpi.freeCashFlow),     clr: selKpi.freeCashFlow >= 0 ? C.emerald : C.red },
            ] as { label: string; val: string; clr: string }[]).map(k => (
              <View key={k.label} style={S.card5}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiVal, { fontSize: 13, color: k.clr }]}>{k.val}</Text>
              </View>
            ))}
          </View>

          {/* Redditività — 5 card in 2 rows using flexWrap */}
          <Text style={base.sectionLabel}>Redditività</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {([
              { key: 'ebitdaPerc',     label: 'EBITDA %',      val: fmtPct(selKpi.ebitdaPerc),     abs: fmtEur(selKpi.ebitda),   ctx: 'Margine operativo lordo' },
              { key: 'ebitPerc',       label: 'EBIT %',        val: fmtPct(selKpi.ebitPerc),       abs: fmtEur(selKpi.ebit),     ctx: 'Margine operativo netto' },
              { key: 'utileNettoPerc', label: 'Utile Netto %', val: fmtPct(selKpi.utileNettoPerc), abs: fmtEur(selKpi.utileNetto),ctx: 'Bottom line' },
              { key: 'roe',            label: 'ROE',           val: fmtPct(selKpi.roe),            abs: '',                      ctx: 'Rendimento cap. proprio' },
              { key: 'roi',            label: 'ROI',           val: fmtPct(selKpi.roi),            abs: '',                      ctx: 'Rendimento totale attivo' },
            ] as { key: string; label: string; val: string; abs: string; ctx: string }[]).map(k => (
              <View key={k.key} style={[S.card5, { width: '19%' }]}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiVal, { color: kpiColor(k.key, parseFloat(k.val)) }]}>{k.val}</Text>
                {k.abs ? <Text style={S.kpiSub}>{k.abs}</Text> : null}
                <Text style={S.kpiCtx}>{k.ctx}</Text>
              </View>
            ))}
          </View>

          {/* Liquidità e Leva */}
          <Text style={base.sectionLabel}>Liquidità e Leva Finanziaria</Text>
          <View style={S.indTable}>
            <View style={S.indHead}>
              <Text style={[S.indHCell, { flex: 1 }]}>Indicatore</Text>
              <Text style={[S.indHCell, { width: 60, textAlign: 'right' }]}>Valore</Text>
              <Text style={[S.indHCell, { width: 72, textAlign: 'right' }]}>Benchmark</Text>
              <Text style={[S.indHCell, { width: 118, textAlign: 'right' }]}>Definizione</Text>
            </View>
            {([
              { key: 'currentRatio', label: 'Current Ratio',  val: fmtX(selKpi.currentRatio),  bench: '> 1.0',  ctx: 'Attivo corrente / Passivo corrente' },
              { key: 'quickRatio',   label: 'Quick Ratio',    val: fmtX(selKpi.quickRatio),    bench: '> 0.8',  ctx: 'Liquidità rapida (senza magazzino)' },
              { key: 'cashRatio',    label: 'Cash Ratio',     val: fmtX(selKpi.cashRatio),     bench: '> 0.2',  ctx: 'Solo liquidità immediata' },
              { key: 'pfnEbitda',    label: 'PFN / EBITDA',   val: fmtX(selKpi.pfnEbitda),     bench: '< 3.0x', ctx: 'Leva finanziaria netta' },
              { key: 'debtToEquity', label: 'Debt / Equity',  val: fmtX(selKpi.debtToEquity),  bench: '< 2.0x', ctx: 'Rapporto di indebitamento' },
            ] as { key: string; label: string; val: string; bench: string; ctx: string }[]).map((k, i) => (
              <View key={k.key} style={i % 2 === 0 ? S.indRow : S.indAlt}>
                <Text style={S.indLabel}>{k.label}</Text>
                <Text style={[S.indVal, { color: kpiColor(k.key, parseFloat(k.val)) }]}>{k.val}</Text>
                <Text style={S.indBench}>{k.bench}</Text>
                <Text style={S.indCtx}>{k.ctx}</Text>
              </View>
            ))}
          </View>

          {/* Ciclo del Capitale Circolante */}
          <Text style={base.sectionLabel}>Ciclo del Capitale Circolante</Text>
          <View style={S.indTable}>
            <View style={S.indHead}>
              <Text style={[S.indHCell, { flex: 1 }]}>Indicatore</Text>
              <Text style={[S.indHCell, { width: 60, textAlign: 'right' }]}>Valore</Text>
              <Text style={[S.indHCell, { width: 195, textAlign: 'right' }]}>Definizione</Text>
            </View>
            {([
              { key: 'dso', label: 'DSO — Giorni Crediti',   val: `${selKpi.dso.toFixed(0)} gg`, ctx: 'Crediti × 365 / Ricavi',     highlight: false },
              { key: 'dio', label: 'DIO — Giorni Magazzino', val: `${selKpi.dio.toFixed(0)} gg`, ctx: 'Magazzino × 365 / COGS',     highlight: false },
              { key: 'dpo', label: 'DPO — Giorni Debiti',    val: `${selKpi.dpo.toFixed(0)} gg`, ctx: 'Debiti × 365 / Acquisti',    highlight: false },
              { key: 'ccc', label: 'CCC — Ciclo Cassa',      val: `${selKpi.ccc.toFixed(0)} gg`, ctx: 'DSO + DIO − DPO',           highlight: true  },
            ] as { key: string; label: string; val: string; ctx: string; highlight: boolean }[]).map((k, i) => (
              <View key={k.key} style={i % 2 === 0 ? S.indRow : S.indAlt}>
                <Text style={[S.indLabel, k.highlight ? { fontFamily: 'Helvetica-Bold', color: C.dark } : {}]}>{k.label}</Text>
                <Text style={[S.indVal, { color: k.highlight ? kpiColor('ccc', selKpi.ccc) : C.slate7 }]}>{k.val}</Text>
                <Text style={[S.indCtx, { width: 195 }]}>{k.ctx}</Text>
              </View>
            ))}
          </View>

        </View>

        <PdfFooter anno={anno} />
      </Page>

      {/* ── PAGE 2: Trend + Stato Patrimoniale + Note ──────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader anno={anno} />

        <View style={base.body}>

          {/* Multi-year trend */}
          {kpis.length > 1 && (
            <>
              <Text style={base.sectionLabel}>Andamento Pluriennale</Text>
              <View style={S.trendSection}>
                {trendKpis.map(({ label, key, fmt }, ti) => {
                  const vals  = kpis.map(k => k[key] as number);
                  const maxV  = Math.max(...vals.map(Math.abs), 0.01);
                  return (
                    <View key={label} style={[S.trendRow, ti === trendKpis.length - 1 ? { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 } : {}]}>
                      <Text style={S.trendLabel}>{label}</Text>
                      {kpis.map(k => {
                        const v = k[key] as number;
                        const color = kpiColor(key, v);
                        return (
                          <View key={k.anno} style={S.trendYearCol}>
                            <Text style={[S.trendYearVal, { color }]}>{fmt(v)}</Text>
                            <TrendBar value={v} max={maxV} color={color} />
                            <Text style={S.trendYearLbl}>{String(k.anno)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Stato Patrimoniale */}
          <Text style={base.sectionLabel}>Stato Patrimoniale Sintetico — {anno}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>

            <View style={S.bsCard}>
              <Text style={S.bsTitle}>Attivo</Text>
              {([
                ['Attivo Corrente',  fmtEur(selInput.attivoCorriente), false],
                ['  Crediti',        fmtEur(selInput.creditiClienti),  false],
                ['  Magazzino',      fmtEur(selInput.magazzino),       false],
                ['  Liquidità',      fmtEur(selInput.liquidita),       false],
                ['Totale Attivo',    fmtEur(selInput.totaleAttivo),    true ],
              ] as [string, string, boolean][]).map(([l, v, bold]) => (
                <View key={l} style={S.bsRow}>
                  <Text style={{ fontSize: 7, color: bold ? C.dark : C.slate6, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica' }}>{l}</Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark }}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={S.bsCard}>
              <Text style={S.bsTitle}>Passivo + Patrimonio Netto</Text>
              {([
                ['Passivo Corrente',  fmtEur(selInput.passivoCorriente),    false],
                ['  Deb. Fornitori',  fmtEur(selInput.debitiFornitori),     false],
                ['Deb. Fin. BT',      fmtEur(selInput.debitiFinanziariBT),  false],
                ['Deb. Fin. LT',      fmtEur(selInput.debitiFinanziariLT),  false],
                ['Patrimonio Netto',  fmtEur(selInput.patrimoniNetto),      true ],
              ] as [string, string, boolean][]).map(([l, v, bold]) => (
                <View key={l} style={S.bsRow}>
                  <Text style={{ fontSize: 7, color: bold ? C.dark : C.slate6, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica' }}>{l}</Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark }}>{v}</Text>
                </View>
              ))}
            </View>

          </View>

          {/* KPI snapshot del periodo selezionato */}
          <Text style={base.sectionLabel}>Riepilogo KPI — {anno}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([
              { label: 'PFN',            val: fmtEur(selInput.debitiFinanziariBT + selInput.debitiFinanziariLT - selInput.liquidita), clr: C.slate7 },
              { label: 'EBITDA %',       val: fmtPct(selKpi.ebitdaPerc), clr: kpiColor('ebitdaPerc', selKpi.ebitdaPerc) },
              { label: 'ROE',            val: fmtPct(selKpi.roe),        clr: kpiColor('roe', selKpi.roe) },
              { label: 'PFN / EBITDA',   val: fmtX(selKpi.pfnEbitda),   clr: kpiColor('pfnEbitda', selKpi.pfnEbitda) },
              { label: 'CCC (giorni)',    val: `${selKpi.ccc.toFixed(0)} gg`, clr: kpiColor('ccc', selKpi.ccc) },
            ] as { label: string; val: string; clr: string }[]).map(k => (
              <View key={k.label} style={[S.card5, { backgroundColor: C.white }]}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiVal, { fontSize: 13, color: k.clr }]}>{k.val}</Text>
              </View>
            ))}
          </View>

          {/* Comments */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={[base.sectionLabel, { marginTop: 14 }]}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {aiComment && (
                  <View style={[S.aiBlock, { flex: 1 }]}>
                    <Text style={S.aiTitle}>Commento AI — Bilancio {anno}</Text>
                    <Text style={S.aiText}>{aiComment}</Text>
                    <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
                      {([
                        { label: 'EBITDA %',   v: fmtPct(selKpi.ebitdaPerc) },
                        { label: 'ROE',        v: fmtPct(selKpi.roe) },
                        { label: 'PFN/EBITDA', v: fmtX(selKpi.pfnEbitda) },
                      ]).map(({ label, v }) => (
                        <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 6, color: '#475569', marginBottom: 2 }}>{label}</Text>
                          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.slate3 }}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {consultantNote && (
                  <View style={[S.noteBlock, { flex: 1 }]}>
                    <Text style={S.noteTitle}>Note del Consulente</Text>
                    <Text style={S.noteText}>{consultantNote}</Text>
                  </View>
                )}
              </View>
            </>
          )}

        </View>

        <PdfFooter anno={anno} />
      </Page>

    </Document>
  );
}
