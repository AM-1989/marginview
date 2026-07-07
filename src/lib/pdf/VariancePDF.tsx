import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { EffectsResult, ComparedLine } from '../varianceAnalysis';
import { C, base, fmtPct, fmtEur, fmtPp, today } from './pdfTheme';

export interface VariancePDFProps {
  effects:        EffectsResult;
  p1Label:        string;
  p2Label:        string;
  aiComment:      string | null;
  consultantNote: string;
}

// ── Local styles ───────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Period comparison strip
  periodStrip: { flexDirection: 'row', marginBottom: 0 },
  periodBox:   { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 12, marginRight: 6 },
  periodLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.slate4, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  periodVal:   { fontFamily: 'Helvetica-Bold', fontSize: 22, marginBottom: 2 },
  periodSub:   { fontSize: 7, color: C.slate5 },

  // Delta card
  deltaCard:   { backgroundColor: C.dark, borderRadius: 6, padding: 12, flex: 0.8 },
  deltaLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.slate4, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  deltaVal:    { fontFamily: 'Helvetica-Bold', fontSize: 22, marginBottom: 2 },
  deltaSub:    { fontSize: 7, color: C.slate5 },

  // Effects grid
  effectsRow:  { flexDirection: 'row', marginBottom: 8 },
  effectBox:   { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10, marginRight: 6 },
  effectBoxLast: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10 },
  effectLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  effectVal:   { fontFamily: 'Helvetica-Bold', fontSize: 16, marginBottom: 2 },
  effectDesc:  { fontSize: 6.5, color: C.slate5 },

  // Waterfall bar
  wfRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  wfLabel:     { width: 80, fontSize: 7, color: C.slate6 },
  wfBar:       { flex: 1, height: 14, borderRadius: 3 },
  wfVal:       { width: 55, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 7 },

  // Driver table
  tableHeader: { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, marginBottom: 2 },
  tableHCell:  { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.slate5, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.slate1 },
  tableAltRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.slate1, backgroundColor: C.bg },
  tableCell:   { fontSize: 7, color: C.slate7 },

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

function clrPp(v: number) { return v > 0 ? C.emerald : v < 0 ? C.red : C.slate5; }

function Header({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <View style={base.header}>
      <View style={base.headerLeft}>
        <Text style={base.headerBrand}>MARGINVIEW</Text>
        <Text style={base.headerTitle}>Analisi Varianza Marginalità</Text>
        <Text style={base.headerSub}>{p1} vs {p2} · Scomposizione effetti di volume, mix, prezzo e costo</Text>
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
      <Text style={base.footerText}>Analisi Varianza — Documento riservato</Text>
      <Text style={base.footerText}>Pag. {page} / {total}</Text>
    </View>
  );
}

function DriverTable({ lines, title }: { lines: ComparedLine[]; title: string }) {
  if (!lines.length) return null;
  return (
    <>
      <Text style={[base.sectionLabel, { marginTop: 12 }]}>{title}</Text>
      <View style={S.tableHeader}>
        {[['32%','Prodotto'],['14%','M% P1'],['14%','M% P2'],['14%','Δ pp'],['13%','Rev P2'],['13%','Marg P2']].map(([w, h]) => (
          <Text key={h} style={[S.tableHCell, { width: w }]}>{h}</Text>
        ))}
      </View>
      {lines.map((l, i) => (
        <View key={l.key} style={i % 2 === 0 ? S.tableRow : S.tableAltRow}>
          <Text style={[S.tableCell, { width: '32%' }]} >{l.descrizione}</Text>
          <Text style={[S.tableCell, { width: '14%', textAlign: 'right' }]}>{l.marginPct1 != null ? fmtPct(l.marginPct1) : '—'}</Text>
          <Text style={[S.tableCell, { width: '14%', textAlign: 'right' }]}>{l.marginPct2 != null ? fmtPct(l.marginPct2) : '—'}</Text>
          <Text style={[S.tableCell, { width: '14%', textAlign: 'right', fontFamily: 'Helvetica-Bold', color: clrPp(l.deltaMarginPct ?? 0) }]}>
            {l.deltaMarginPct != null ? fmtPp(l.deltaMarginPct) : '—'}
          </Text>
          <Text style={[S.tableCell, { width: '13%', textAlign: 'right' }]}>{fmtEur(l.rev2)}</Text>
          <Text style={[S.tableCell, { width: '13%', textAlign: 'right', color: (l.margin2 ?? 0) >= 0 ? C.emerald : C.red }]}>{fmtEur(l.margin2 ?? 0)}</Text>
        </View>
      ))}
    </>
  );
}

function EffectBar({ label, value, maxAbs }: { label: string; value: number; maxAbs: number }) {
  const BAR_W = 200;
  const centerX = BAR_W / 2;
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const barW = ratio * (BAR_W / 2 - 2);
  const isPos = value >= 0;
  const x = isPos ? centerX : centerX - barW;
  const fill = isPos ? C.emerald : C.red;

  return (
    <View style={S.wfRow}>
      <Text style={S.wfLabel}>{label}</Text>
      <Svg width={BAR_W} height={14}>
        <Rect x={0} y={4} width={BAR_W} height={6} fill={C.slate1} rx={3} />
        <Rect x={centerX} y={0} width={1} height={14} fill={C.slate3} />
        {barW > 0 && <Rect x={x} y={4} width={barW} height={6} fill={fill} rx={3} />}
      </Svg>
      <Text style={[S.wfVal, { color: clrPp(value) }]}>{fmtPp(value)}</Text>
    </View>
  );
}

// ── Main document ──────────────────────────────────────────────────────────────

export default function VariancePDF({ effects, p1Label, p2Label, aiComment, consultantNote }: VariancePDFProps) {
  const delta  = effects.marginPctP2 - effects.marginPctP1;
  const effs   = [effects.effVolume, effects.effMix, effects.effPrezzo, effects.effCosto];
  const maxAbs = Math.max(...effs.map(Math.abs), 0.1);

  return (
    <Document>

      {/* ── PAGE 1: Overview + Effects + Drivers ──────────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header p1={p1Label} p2={p2Label} />

        <View style={base.body}>

          {/* Period comparison */}
          <Text style={base.sectionLabel}>Confronto Periodi</Text>
          <View style={S.periodStrip}>
            <View style={S.periodBox}>
              <Text style={S.periodLabel}>{p1Label} (Base)</Text>
              <Text style={[S.periodVal, { color: C.dark }]}>{fmtPct(effects.marginPctP1)}</Text>
              <Text style={S.periodSub}>
                Fatturato: {fmtEur(effects.totalRev1)} · Margine: {fmtEur(effects.totalMargin1)}
              </Text>
            </View>
            <View style={S.periodBox}>
              <Text style={S.periodLabel}>{p2Label} (Confronto)</Text>
              <Text style={[S.periodVal, { color: C.dark }]}>{fmtPct(effects.marginPctP2)}</Text>
              <Text style={S.periodSub}>
                Fatturato: {fmtEur(effects.totalRev2)} · Margine: {fmtEur(effects.totalMargin2)}
              </Text>
            </View>
            <View style={S.deltaCard}>
              <Text style={S.deltaLabel}>Variazione Totale</Text>
              <Text style={[S.deltaVal, { color: clrPp(delta) }]}>{fmtPp(delta)}</Text>
              <Text style={S.deltaSub}>
                Δ Fatturato: {fmtEur(effects.totalRev2 - effects.totalRev1)}{'\n'}
                Δ Margine €: {fmtEur(effects.totalMargin2 - effects.totalMargin1)}
              </Text>
            </View>
          </View>

          {/* Effect decomposition */}
          <Text style={base.sectionLabel}>Scomposizione Effetti (in pp di margine %)</Text>
          <View style={S.effectsRow}>
            {[
              { label: 'Effetto Volume',  value: effects.effVolume,  desc: 'Cambiamento quantità vendute' },
              { label: 'Effetto Mix',     value: effects.effMix,     desc: 'Cambio nella composizione del mix' },
              { label: 'Effetto Prezzo',  value: effects.effPrezzo,  desc: 'Variazione prezzi di vendita' },
              { label: 'Effetto Costo',   value: effects.effCosto,   desc: 'Variazione costi di acquisto' },
            ].map((e, i) => (
              <View key={e.label} style={i < 3 ? S.effectBox : S.effectBoxLast}>
                <Text style={S.effectLabel}>{e.label}</Text>
                <Text style={[S.effectVal, { color: clrPp(e.value) }]}>{fmtPp(e.value)}</Text>
                <Text style={S.effectDesc}>{e.desc}</Text>
              </View>
            ))}
          </View>

          {/* Waterfall visual */}
          <Text style={base.sectionLabel}>Contributo Visivo degli Effetti</Text>
          <View style={[base.card, { paddingVertical: 12 }]}>
            {[
              { label: 'Eff. Volume', value: effects.effVolume },
              { label: 'Eff. Mix',    value: effects.effMix },
              { label: 'Eff. Prezzo', value: effects.effPrezzo },
              { label: 'Eff. Costo',  value: effects.effCosto },
              { label: 'Δ Totale',    value: delta },
            ].map(e => (
              <EffectBar key={e.label} label={e.label} value={e.value} maxAbs={Math.max(maxAbs, Math.abs(delta))} />
            ))}
          </View>

          {/* Top Drivers */}
          <DriverTable lines={effects.topVariations.slice(0, 8)} title="Top Variazioni per Prodotto" />

        </View>

        <Footer page={1} total={2} />
      </Page>

      {/* ── PAGE 2: More drivers + Comments ───────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header p1={p1Label} p2={p2Label} />

        <View style={base.body}>
          <DriverTable lines={effects.topBest.slice(0, 5)} title="Top 5 Migliori Performer" />
          <DriverTable lines={effects.topWorst.slice(0, 5)} title="Top 5 Peggiori Performer" />

          {/* Comments */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={base.sectionLabel}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row' }}>
                {aiComment && (
                  <View style={[S.commentBlock, { flex: 1, marginRight: consultantNote ? 10 : 0 }]}>
                    <Text style={S.commentTitle}>Commento AI — Varianza Marginalità</Text>
                    <Text style={S.commentText}>{aiComment}</Text>
                    <View style={S.statRow}>
                      {[
                        { label: 'Δ Totale',    v: fmtPp(delta) },
                        { label: 'Eff. Volume', v: fmtPp(effects.effVolume) },
                        { label: 'Eff. Mix',    v: fmtPp(effects.effMix) },
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
