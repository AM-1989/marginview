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

// ── Local styles ───────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // KPI section
  kpiGrid:    { flexDirection: 'row', flexWrap: 'wrap' },
  kpiBox:     { width: '24%', backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 9, marginRight: '1.3%', marginBottom: 7 },
  kpiLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 5.5, color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 4 },
  kpiValue:   { fontFamily: 'Helvetica-Bold', fontSize: 17, marginBottom: 2 },
  kpiSub:     { fontSize: 6.5, color: C.slate5 },
  kpiContext: { fontSize: 6, color: C.slate4, marginTop: 2 },

  // Section divider
  divider:    { height: 1, backgroundColor: C.slate2, marginVertical: 12 },

  // Trend row
  trendRow:   { flexDirection: 'row', marginBottom: 6, alignItems: 'center' },
  trendLabel: { width: 100, fontSize: 7, color: C.slate6 },
  trendBars:  { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  trendYearLabel: { fontSize: 5.5, color: C.slate4, textAlign: 'center', marginTop: 2 },

  // Indicator table
  indicRow:   { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.slate1 },
  indicAlt:   { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.slate1, backgroundColor: C.bg },
  indicLabel: { flex: 1, fontSize: 7.5, color: C.slate7 },
  indicVal:   { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  indicBench: { width: 80, textAlign: 'right', fontSize: 7, color: C.slate4 },

  // Comment blocks
  commentBlock:{ backgroundColor: C.dark, borderRadius: 8, padding: 14, marginBottom: 10 },
  commentTitle:{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.white, marginBottom: 8 },
  commentText: { fontSize: 8, color: '#94a3b8', lineHeight: 1.6 },
  noteBlock:   { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 14 },
  noteTitle:   { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, marginBottom: 8 },
  noteText:    { fontSize: 8, color: C.slate6, lineHeight: 1.6 },
  statRow:     { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' },
  statBox:     { flex: 1, alignItems: 'center' },
  statLabel:   { fontSize: 6, color: '#475569', marginBottom: 2 },
  statValue:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.slate3 },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function kpiColor(key: string, v: number): string {
  const thresholds: Record<string, [number, number]> = {
    ebitdaPerc:    [5, 15],
    ebitPerc:      [2, 10],
    utileNettoPerc:[1, 7],
    roe:           [5, 15],
    roi:           [3, 10],
    currentRatio:  [1.0, 1.5],
    pfnEbitda:     [3, 5],
    ccc:           [60, 90],
  };
  const t = thresholds[key];
  if (!t) return C.slate7;
  const isPfnOrCcc = key === 'pfnEbitda' || key === 'ccc';
  if (isPfnOrCcc) {
    return v <= t[0] ? C.emerald : v <= t[1] ? C.amber : C.red;
  }
  return v >= t[1] ? C.emerald : v >= t[0] ? C.amber : C.red;
}

function Header({ anno }: { anno: number }) {
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

function Footer({ page, total }: { page: number; total: number }) {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Analisi Bilancio — Documento riservato</Text>
      <Text style={base.footerText}>Pag. {page} / {total}</Text>
    </View>
  );
}

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const W = 28;
  const H = 30;
  const barH = max > 0 ? Math.max(2, (Math.abs(value) / max) * (H - 4)) : 2;
  return (
    <View style={{ alignItems: 'center', marginRight: 3 }}>
      <Svg width={W} height={H}>
        <Rect x={4} y={0} width={W - 8} height={H} fill={C.slate1} rx={2} />
        <Rect x={4} y={H - barH} width={W - 8} height={barH} fill={color} rx={2} />
      </Svg>
    </View>
  );
}

// ── Main document ──────────────────────────────────────────────────────────────

export default function BalancePDF({ kpis, selKpi, selInput, aiComment, consultantNote }: BalancePDFProps) {
  const anno = selKpi.anno;

  const profitKPIs = [
    { key: 'ebitdaPerc',     label: 'EBITDA %',       value: fmtPct(selKpi.ebitdaPerc),     abs: fmtEur(selKpi.ebitda),   context: 'Margine operativo lordo' },
    { key: 'ebitPerc',       label: 'EBIT %',         value: fmtPct(selKpi.ebitPerc),       abs: fmtEur(selKpi.ebit),     context: 'Margine operativo netto' },
    { key: 'utileNettoPerc', label: 'Utile Netto %',  value: fmtPct(selKpi.utileNettoPerc), abs: fmtEur(selKpi.utileNetto), context: 'Bottom line' },
    { key: 'roe',            label: 'ROE',            value: fmtPct(selKpi.roe),            abs: '',                      context: 'Rendimento del capitale proprio' },
    { key: 'roi',            label: 'ROI',            value: fmtPct(selKpi.roi),            abs: '',                      context: 'Rendimento del totale attivo' },
  ];

  const liquidityKPIs = [
    { key: 'currentRatio', label: 'Current Ratio',   value: fmtX(selKpi.currentRatio),   bench: '> 1.0',  context: 'Attivo corrente / Passivo corrente' },
    { key: 'quickRatio',   label: 'Quick Ratio',     value: fmtX(selKpi.quickRatio),     bench: '> 0.8',  context: 'Senza magazzino' },
    { key: 'cashRatio',    label: 'Cash Ratio',      value: fmtX(selKpi.cashRatio),      bench: '> 0.2',  context: 'Solo liquidità immediata' },
    { key: 'pfnEbitda',    label: 'PFN / EBITDA',    value: fmtX(selKpi.pfnEbitda),      bench: '< 3.0x', context: 'Leva finanziaria netta' },
    { key: 'debtToEquity', label: 'Debt / Equity',   value: fmtX(selKpi.debtToEquity),   bench: '< 2.0x', context: 'Rapporto di indebitamento' },
  ];

  const workingCapKPIs = [
    { key: 'dso', label: 'DSO — Giorni Crediti',   value: `${selKpi.dso.toFixed(0)} gg`, context: 'Crediti × 365 / Ricavi' },
    { key: 'dio', label: 'DIO — Giorni Magazzino', value: `${selKpi.dio.toFixed(0)} gg`, context: 'Magazzino × 365 / COGS' },
    { key: 'dpo', label: 'DPO — Giorni Debiti',    value: `${selKpi.dpo.toFixed(0)} gg`, context: 'Debiti × 365 / Acquisti' },
    { key: 'ccc', label: 'CCC — Ciclo Cassa',      value: `${selKpi.ccc.toFixed(0)} gg`, context: 'DSO + DIO − DPO' },
  ];

  // Trend data for sparklines
  const trendKpis: { label: string; key: keyof BalanceKPI; fmt: (v: number) => string }[] = [
    { label: 'EBITDA %',   key: 'ebitdaPerc',     fmt: fmtPct },
    { label: 'ROE',        key: 'roe',             fmt: fmtPct },
    { label: 'PFN/EBITDA', key: 'pfnEbitda',       fmt: fmtX  },
    { label: 'CCC (gg)',   key: 'ccc',             fmt: v => `${v.toFixed(0)}` },
  ];

  return (
    <Document>

      {/* ── PAGE 1: KPIs ────────────────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header anno={anno} />

        <View style={base.body}>

          {/* Revenue summary strip */}
          <Text style={base.sectionLabel}>Conto Economico Sintesi — {anno}</Text>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {[
              { label: 'Ricavi',         value: fmtEur(selInput.ricavi),                          color: C.dark },
              { label: 'EBITDA',         value: fmtEur(selKpi.ebitda),                            color: kpiColor('ebitdaPerc', selKpi.ebitdaPerc) },
              { label: 'EBIT',           value: fmtEur(selKpi.ebit),                              color: kpiColor('ebitPerc', selKpi.ebitPerc) },
              { label: 'Utile Netto',    value: fmtEur(selKpi.utileNetto),                        color: selKpi.utileNetto >= 0 ? C.emerald : C.red },
              { label: 'Free Cash Flow', value: fmtEur(selKpi.freeCashFlow),                      color: selKpi.freeCashFlow >= 0 ? C.emerald : C.red },
            ].map((k, i) => (
              <View key={k.label} style={[S.kpiBox, i === 4 ? { marginRight: 0 } : {}]}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiValue, { fontSize: 14, color: k.color }]}>{k.value}</Text>
              </View>
            ))}
          </View>

          {/* Profitability */}
          <Text style={base.sectionLabel}>Redditività</Text>
          <View style={S.kpiGrid}>
            {profitKPIs.map((k, i) => (
              <View key={k.key} style={[S.kpiBox, i === 4 ? { marginRight: 0 } : {}]}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiValue, { color: kpiColor(k.key, parseFloat(k.value)) }]}>{k.value}</Text>
                {k.abs && <Text style={S.kpiSub}>{k.abs}</Text>}
                <Text style={S.kpiContext}>{k.context}</Text>
              </View>
            ))}
          </View>

          {/* Liquidity + Leverage */}
          <Text style={base.sectionLabel}>Liquidità e Leva Finanziaria</Text>
          <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' }}>
            {liquidityKPIs.map((k, i) => (
              <View key={k.key} style={i % 2 === 0 ? S.indicRow : S.indicAlt}>
                <Text style={S.indicLabel}>{k.label}</Text>
                <Text style={[S.indicVal, { color: kpiColor(k.key, parseFloat(k.value)) }]}>{k.value}</Text>
                <Text style={S.indicBench}>benchmark {k.bench}</Text>
                <Text style={[S.indicLabel, { color: C.slate4, fontSize: 6.5, flex: 0, width: 130, textAlign: 'right' }]}>{k.context}</Text>
              </View>
            ))}
          </View>

          {/* Working Capital */}
          <Text style={base.sectionLabel}>Ciclo del Capitale Circolante</Text>
          <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' }}>
            {workingCapKPIs.map((k, i) => (
              <View key={k.key} style={i % 2 === 0 ? S.indicRow : S.indicAlt}>
                <Text style={S.indicLabel}>{k.label}</Text>
                <Text style={[S.indicVal, { color: k.key === 'ccc' ? kpiColor('ccc', selKpi.ccc) : C.slate7 }]}>{k.value}</Text>
                <Text style={[S.indicLabel, { color: C.slate4, fontSize: 6.5, flex: 0, width: 220, textAlign: 'right' }]}>{k.context}</Text>
              </View>
            ))}
          </View>

        </View>

        <Footer page={1} total={2} />
      </Page>

      {/* ── PAGE 2: Trend + Comments ─────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header anno={anno} />

        <View style={base.body}>

          {/* Multi-year trend */}
          {kpis.length > 1 && (
            <>
              <Text style={base.sectionLabel}>Andamento Pluriennale</Text>
              <View style={[base.card, { marginBottom: 0 }]}>
                {trendKpis.map(({ label, key, fmt }) => {
                  const values = kpis.map(k => k[key] as number);
                  const maxV   = Math.max(...values.map(Math.abs), 0.01);
                  return (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.slate1 }}>
                      <Text style={{ width: 80, fontSize: 7, color: C.slate6, paddingTop: 22 }}>{label}</Text>
                      {kpis.map(k => {
                        const v = k[key] as number;
                        const color = kpiColor(key, v);
                        return (
                          <View key={k.anno} style={{ alignItems: 'center', marginRight: 6 }}>
                            <Text style={{ fontSize: 6, color, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{fmt(v)}</Text>
                            <TrendBar value={v} max={maxV} color={color} />
                            <Text style={{ fontSize: 5.5, color: C.slate4, marginTop: 2 }}>{String(k.anno)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Patrimonial snapshot */}
          <Text style={base.sectionLabel}>Stato Patrimoniale Sintetico — {anno}</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={[base.card, { flex: 1, marginRight: 8 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.slate5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Attivo</Text>
              {[
                ['Attivo Corrente', fmtEur(selInput.attivoCorriente)],
                ['di cui Crediti',  fmtEur(selInput.creditiClienti)],
                ['di cui Magazzino',fmtEur(selInput.magazzino)],
                ['di cui Liquidità',fmtEur(selInput.liquidita)],
                ['Totale Attivo',   fmtEur(selInput.totaleAttivo)],
              ].map(([l, v], idx) => (
                <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.slate1 }}>
                  <Text style={{ fontSize: 7, color: idx === 4 ? C.dark : C.slate6, fontFamily: idx === 4 ? 'Helvetica-Bold' : 'Helvetica' }}>{l}</Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark }}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={[base.card, { flex: 1 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.slate5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Passivo + PN</Text>
              {[
                ['Passivo Corrente',    fmtEur(selInput.passivoCorriente)],
                ['di cui Deb. Forn.',   fmtEur(selInput.debitiFornitori)],
                ['Deb. Fin. BT',        fmtEur(selInput.debitiFinanziariBT)],
                ['Deb. Fin. LT',        fmtEur(selInput.debitiFinanziariLT)],
                ['Patrimonio Netto',    fmtEur(selInput.patrimoniNetto)],
              ].map(([l, v], idx) => (
                <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.slate1 }}>
                  <Text style={{ fontSize: 7, color: idx === 4 ? C.dark : C.slate6, fontFamily: idx === 4 ? 'Helvetica-Bold' : 'Helvetica' }}>{l}</Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark }}>{v}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Comments */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={base.sectionLabel}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row' }}>
                {aiComment && (
                  <View style={[S.commentBlock, { flex: 1, marginRight: consultantNote ? 10 : 0 }]}>
                    <Text style={S.commentTitle}>Commento AI — Bilancio {anno}</Text>
                    <Text style={S.commentText}>{aiComment}</Text>
                    <View style={S.statRow}>
                      {[
                        { label: 'EBITDA %',   v: fmtPct(selKpi.ebitdaPerc) },
                        { label: 'ROE',        v: fmtPct(selKpi.roe) },
                        { label: 'PFN/EBITDA', v: fmtX(selKpi.pfnEbitda) },
                      ].map(({ label, v }) => (
                        <View key={label} style={S.statBox}>
                          <Text style={S.statLabel}>{label}</Text>
                          <Text style={S.statValue}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {consultantNote && (
                  <View style={[S.noteBlock, { flex: 1 }]}>
                    <Text style={S.noteTitle}>Commento del Consulente</Text>
                    <Text style={S.noteText}>{consultantNote}</Text>
                  </View>
                )}
              </View>
            </>
          )}

        </View>

        <Footer page={2} total={2} />
      </Page>
    </Document>
  );
}
