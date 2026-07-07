import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { ClassifiedRow, SegmentKey } from '../abcMatrixCalc';
import { SEGMENTS } from '../abcMatrixCalc';
import { C, SEG_FILL, SEG_BG, base, fmtEur, fmtPct, today } from './pdfTheme';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EnrichedAction {
  n:           number;
  priority:    'alta' | 'media' | 'bassa';
  title:       string;
  description: string;
  impact:      number;
  products:    ClassifiedRow[];
}

export interface ABCMatrixPDFProps {
  products:       ClassifiedRow[];
  totalRevenue:   number;
  totalProfit:    number;
  weightedMargin: number;
  gini:           number;
  paretoIndex:    number;
  starRevenuePct: number;
  riskRevenuePct: number;
  belowAvgCount:  number;
  matrix:         Record<SegmentKey, { count: number; revenue: number; revenuePct: number }>;
  health: {
    total: number;
    diversification: number;
    starScore: number;
    riskScore: number;
    profitability: number;
    resilience: number;
  };
  enrichedActions: EnrichedAction[];
  totalImpact:    number;
  aiComment:      string | null;
  consultantNote: string;
}

// ── Local styles ───────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // KPI large
  kpiRow:    { flexDirection: 'row', marginBottom: 8 },
  kpiBox:    { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10, marginRight: 7 },
  kpiBoxLast:{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10 },
  kpiLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 6, color: C.slate4, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  kpiValue:  { fontFamily: 'Helvetica-Bold', fontSize: 19, color: C.dark, marginBottom: 2 },
  kpiSub:    { fontSize: 7, color: C.slate5 },

  // KPI secondary
  secRow:    { flexDirection: 'row', marginBottom: 16 },
  secBox:    { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 8, alignItems: 'center', marginRight: 7 },
  secBoxLast:{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 8, alignItems: 'center' },
  secLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 5.5, color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', marginBottom: 4 },
  secValue:  { fontFamily: 'Helvetica-Bold', fontSize: 13 },

  // Matrix + health side by side
  twoCol:    { flexDirection: 'row' },
  matrixWrap:{ flex: 1, marginRight: 14 },
  healthWrap:{ width: 180 },

  // Matrix 3x3
  matrixHeader: { flexDirection: 'row', marginBottom: 2, marginLeft: 42 },
  matrixHeaderCell: { flex: 1, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.slate5 },
  matrixRow: { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  matrixRowLabel: { width: 42, fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.slate5 },
  matrixCell: { flex: 1, borderRadius: 5, padding: 6, marginRight: 3, alignItems: 'center' },
  matrixCellLast: { flex: 1, borderRadius: 5, padding: 6, alignItems: 'center' },
  matrixCount: { fontFamily: 'Helvetica-Bold', fontSize: 15 },
  matrixRev:   { fontSize: 6.5, marginTop: 2 },
  matrixPct:   { fontSize: 5.5, marginTop: 1 },

  // Health score
  healthScore: { fontFamily: 'Helvetica-Bold', fontSize: 32, textAlign: 'center', marginBottom: 2 },
  healthGrade: { fontSize: 7, textAlign: 'center', color: C.slate5, marginBottom: 10 },
  healthRow:   { marginBottom: 7 },
  healthLabel: { fontSize: 6.5, color: C.slate6, marginBottom: 2 },
  healthBarBg: { height: 4, backgroundColor: C.slate1, borderRadius: 2 },
  healthScore2:{ fontSize: 6.5, color: C.slate5, marginTop: 1 },

  // Action items
  actionItem:  { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10, marginBottom: 6, flexDirection: 'row' },
  actionN:     { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate1, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  actionNText: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.slate6 },
  actionBody:  { flex: 1 },
  actionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.dark, marginBottom: 3 },
  actionDesc:  { fontSize: 7, color: C.slate5, lineHeight: 1.5, marginBottom: 4 },
  actionMeta:  { flexDirection: 'row' },
  actionImpact:{ fontSize: 6.5, color: C.slate5, marginRight: 12 },
  actionPriTag:{ fontSize: 6, fontFamily: 'Helvetica-Bold', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3, color: C.white },

  // Products table
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <View style={base.header}>
      <View style={base.headerLeft}>
        <Text style={base.headerBrand}>MARGINVIEW</Text>
        <Text style={base.headerTitle}>{subtitle}</Text>
        <Text style={base.headerSub}>Analisi Fatturato × Margine · Classificazione Prodotti</Text>
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
      <Text style={base.footerText}>Matrice ABC — Documento riservato</Text>
      <Text style={base.footerText}>Pag. {page} / {total}</Text>
    </View>
  );
}

function HealthBar({ score, color }: { score: number; color: string }) {
  const W = 158;
  const filled = Math.max(0, Math.min(W, (score / 100) * W));
  return (
    <Svg width={W} height={4}>
      <Rect x={0} y={0} width={W} height={4} fill={C.slate1} rx={2} />
      <Rect x={0} y={0} width={filled} height={4} fill={color} rx={2} />
    </Svg>
  );
}

// ── Main document ──────────────────────────────────────────────────────────────

export default function ABCMatrixPDF({
  products, totalRevenue, totalProfit, weightedMargin,
  gini, paretoIndex, starRevenuePct, riskRevenuePct, belowAvgCount,
  matrix, health, enrichedActions, totalImpact, aiComment, consultantNote,
}: ABCMatrixPDFProps) {

  const SEGS: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const top20 = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 20);

  const priColor = (p: string) =>
    p === 'alta' ? C.red : p === 'media' ? C.amber : C.slate5;

  const healthColor = (s: number) =>
    s >= 70 ? C.emerald : s >= 45 ? C.amber : C.red;

  const classARevenue = (['AA','AB','AC'] as SegmentKey[]).reduce((s, k) => s + (matrix[k]?.revenue ?? 0), 0);

  return (
    <Document>

      {/* ── PAGE 1: Dashboard ─────────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header subtitle="Matrice ABC" />

        <View style={base.body}>

          {/* KPI large */}
          <Text style={base.sectionLabel}>Indicatori Principali</Text>
          <View style={S.kpiRow}>
            {[
              { label: products.length === 1 ? 'Prodotto' : 'Prodotti', value: products.length.toString(), sub: `${[...new Set(products.map(p => p.category))].length} categorie` },
              { label: 'Fatturato Totale', value: fmtEur(totalRevenue), sub: `Costo: ${fmtEur(totalRevenue - totalProfit)}` },
              { label: 'Margine Medio', value: fmtPct(weightedMargin), sub: `Profitto: ${fmtEur(totalProfit)}` },
              { label: 'Star (A-A)', value: (matrix.AA?.count ?? 0).toString(), sub: `${fmtPct(starRevenuePct)} del fatturato` },
            ].map((kpi, i) => (
              <View key={i} style={i < 3 ? S.kpiBox : S.kpiBoxLast}>
                <Text style={S.kpiLabel}>{kpi.label}</Text>
                <Text style={[S.kpiValue, { color: i === 2 ? (weightedMargin >= 0 ? C.emerald : C.red) : C.dark }]}>{kpi.value}</Text>
                <Text style={S.kpiSub}>{kpi.sub}</Text>
              </View>
            ))}
          </View>

          {/* KPI secondary */}
          <View style={S.secRow}>
            {[
              { label: 'Concentrazione Gini', value: gini.toFixed(2), color: gini > 0.6 ? C.red : C.emerald },
              { label: 'Indice Pareto', value: fmtPct(paretoIndex), color: C.slate7 },
              { label: 'Fatturato Star', value: fmtPct(starRevenuePct), color: C.emerald },
              { label: 'Fatturato a Rischio', value: fmtPct(riskRevenuePct), color: riskRevenuePct > 20 ? C.red : C.slate7 },
              { label: 'Sotto Media', value: `${belowAvgCount} prod.`, color: C.slate7 },
            ].map((k, i) => (
              <View key={i} style={i < 4 ? S.secBox : S.secBoxLast}>
                <Text style={S.secLabel}>{k.label}</Text>
                <Text style={[S.secValue, { color: k.color }]}>{k.value}</Text>
              </View>
            ))}
          </View>

          {/* Matrix + Health side by side */}
          <Text style={base.sectionLabel}>Matrice Fatturato × Margine</Text>
          <View style={S.twoCol}>

            {/* 3×3 Matrix */}
            <View style={S.matrixWrap}>
              <View style={S.matrixHeader}>
                {['Margine A', 'Margine B', 'Margine C'].map(h => (
                  <Text key={h} style={S.matrixHeaderCell}>{h}</Text>
                ))}
              </View>
              {(['A','B','C'] as const).map(rev => (
                <View key={rev} style={S.matrixRow}>
                  <Text style={S.matrixRowLabel}>Fatt. {rev}</Text>
                  {(['A','B','C'] as const).map((marg, mi) => {
                    const key = `${rev}${marg}` as SegmentKey;
                    const cell = matrix[key];
                    const seg = SEGMENTS[key];
                    return (
                      <View key={key} style={[
                        mi < 2 ? S.matrixCell : S.matrixCellLast,
                        { backgroundColor: SEG_BG[key] },
                      ]}>
                        <Text style={[S.matrixCount, { color: SEG_FILL[key] }]}>{cell?.count ?? 0}</Text>
                        <Text style={[S.matrixRev, { color: SEG_FILL[key] }]}>{seg.label}</Text>
                        <Text style={[S.matrixPct, { color: C.slate5 }]}>{fmtPct(cell?.revenuePct ?? 0)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* Mini legend */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                {SEGS.filter(k => (matrix[k]?.count ?? 0) > 0).map(k => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SEG_FILL[k], marginRight: 3 }} />
                    <Text style={{ fontSize: 6, color: C.slate5 }}>{k} · {SEGMENTS[k].label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Health Score */}
            <View style={[S.healthWrap, base.card]}>
              <Text style={[base.sectionLabel, { marginTop: 0 }]}>Health Score</Text>
              <Text style={[S.healthScore, { color: healthColor(health.total) }]}>{health.total}</Text>
              <Text style={S.healthGrade}>
                {health.total >= 80 ? 'A — Eccellente' : health.total >= 65 ? 'B — Buono' : health.total >= 45 ? 'C — Da migliorare' : 'D — Critico'}
              </Text>
              {[
                { label: 'Diversificazione', score: health.diversification },
                { label: 'Prodotti Star',    score: health.starScore },
                { label: 'Rischio',          score: health.riskScore },
                { label: 'Profittabilità',   score: health.profitability },
                { label: 'Resilienza',       score: health.resilience },
              ].map(({ label, score }) => (
                <View key={label} style={S.healthRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={S.healthLabel}>{label}</Text>
                    <Text style={[S.healthScore2, { color: healthColor(score) }]}>{score}/100</Text>
                  </View>
                  <HealthBar score={score} color={healthColor(score)} />
                </View>
              ))}

              <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.slate2 }}>
                <Text style={{ fontSize: 6.5, color: C.slate5, lineHeight: 1.5 }}>
                  Classe A: {(['AA','AB','AC'] as SegmentKey[]).reduce((s, k) => s + (matrix[k]?.count ?? 0), 0)} prod.{' '}
                  · {fmtPct(totalRevenue > 0 ? classARevenue / totalRevenue * 100 : 0)} del fatturato
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Footer page={1} total={2} />
      </Page>

      {/* ── PAGE 2: Action Items + Products + Comments ─────────────────────── */}
      <Page size="A4" style={base.page}>
        <Header subtitle="Matrice ABC" />

        <View style={base.body}>

          {/* Action Items */}
          {enrichedActions.length > 0 && (
            <>
              <Text style={base.sectionLabel}>
                Action Items · {enrichedActions.length} azioni · Impatto stimato: {fmtEur(totalImpact)}
              </Text>
              {enrichedActions.map(a => (
                <View key={a.n} style={S.actionItem}>
                  <View style={S.actionN}>
                    <Text style={S.actionNText}>{a.n}</Text>
                  </View>
                  <View style={S.actionBody}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <Text style={[S.actionTitle, { flex: 1, marginRight: 8 }]}>{a.title}</Text>
                      <View style={[S.actionPriTag, { backgroundColor: priColor(a.priority) }]}>
                        <Text style={{ fontSize: 6, color: C.white, fontFamily: 'Helvetica-Bold' }}>
                          {a.priority.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={S.actionDesc}>{a.description}</Text>
                    <View style={S.actionMeta}>
                      <Text style={S.actionImpact}>Impatto: {fmtEur(a.impact)}</Text>
                      <Text style={S.actionImpact}>Prodotti: {a.products.length}</Text>
                      <Text style={[S.actionImpact, { color: C.slate4 }]}>
                        {a.products.slice(0, 4).map(p => p.id).join(', ')}{a.products.length > 4 ? ` +${a.products.length - 4}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Top Products Table */}
          <Text style={base.sectionLabel}>Top {top20.length} Prodotti per Fatturato</Text>
          <View style={S.tableHeader}>
            {[['28%','Codice'],['30%','Descrizione'],['16%','Fatturato'],['10%','Marg %'],['10%','Profitto'],['6%','Seg']].map(([w, h]) => (
              <Text key={h} style={[S.tableHCell, { width: w }]}>{h}</Text>
            ))}
          </View>
          {top20.map((p, i) => (
            <View key={p.id} style={i % 2 === 0 ? S.tableRow : S.tableAltRow}>
              <Text style={[S.tableCell, { width: '28%', color: C.slate4 }]}>{p.id}</Text>
              <Text style={[S.tableCell, { width: '30%' }]} >{p.name}</Text>
              <Text style={[S.tableCell, { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmtEur(p.revenue)}</Text>
              <Text style={[S.tableCell, { width: '10%', textAlign: 'right', color: p.marginPct >= weightedMargin ? C.emerald : C.red, fontFamily: 'Helvetica-Bold' }]}>{fmtPct(p.marginPct)}</Text>
              <Text style={[S.tableCell, { width: '10%', textAlign: 'right', color: p.profit >= 0 ? C.emerald : C.red }]}>{fmtEur(p.profit)}</Text>
              <Text style={[S.tableCell, { width: '6%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: SEG_FILL[p.segment] }]}>{p.segment}</Text>
            </View>
          ))}
          {products.length > 20 && (
            <Text style={{ fontSize: 6.5, color: C.slate4, textAlign: 'center', marginTop: 5 }}>
              +{products.length - 20} prodotti non mostrati
            </Text>
          )}

          {/* Comments */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={base.sectionLabel}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row' }}>
                {aiComment && (
                  <View style={[S.commentBlock, { flex: 1, marginRight: consultantNote ? 10 : 0 }]}>
                    <Text style={S.commentTitle}>Commento AI — Matrice ABC</Text>
                    <Text style={S.commentText}>{aiComment}</Text>
                    <View style={S.statRow}>
                      {[
                        { label: 'Health Score', v: `${health.total}/100` },
                        { label: 'Margine medio', v: fmtPct(weightedMargin) },
                        { label: 'Rischio', v: fmtPct(riskRevenuePct) },
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
