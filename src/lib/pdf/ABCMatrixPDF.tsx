import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { ClassifiedRow, SegmentKey } from '../abcMatrixCalc';
import { SEGMENTS } from '../abcMatrixCalc';
import { C, SEG_FILL, SEG_BG, base, fmtEur, fmtPct, today } from './pdfTheme';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // KPI primary row
  kpiRow:   { flexDirection: 'row', gap: 6 },
  kpiCard:  { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10 },
  kpiLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  kpiVal:   { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 2 },
  kpiSub:   { fontSize: 6.5, color: C.slate5 },

  // Secondary KPI badges
  secRow:   { flexDirection: 'row', gap: 6 },
  secCard:  { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 8, alignItems: 'center' },
  secLabel: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center', marginBottom: 4 },
  secVal:   { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center' },

  // Matrix + Health two-column
  twoCol:      { flexDirection: 'row', gap: 12 },
  matrixWrap:  { flex: 1 },
  healthWrap:  { width: 178 },

  // 3×3 Matrix
  matrixHead:     { flexDirection: 'row', marginBottom: 2, marginLeft: 44 },
  matrixHeadCell: { flex: 1, textAlign: 'center', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.slate5 },
  matrixRow:      { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  matrixRowLabel: { width: 44, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.slate5 },
  matrixCell:     { flex: 1, borderRadius: 5, padding: 6, marginRight: 3, alignItems: 'center' },
  matrixCellLast: { flex: 1, borderRadius: 5, padding: 6, alignItems: 'center' },
  matrixCount:    { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  matrixLabel:    { fontSize: 6.5, marginTop: 2 },
  matrixPct:      { fontSize: 5.5, marginTop: 1, color: C.slate5 },

  // Health score
  healthScore:  { fontSize: 32, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  healthGrade:  { fontSize: 7, textAlign: 'center', color: C.slate5, marginBottom: 10 },
  healthRow:    { marginBottom: 7 },
  healthLabel:  { fontSize: 6.5, color: C.slate6, marginBottom: 2 },
  healthBarVal: { fontSize: 6.5, color: C.slate5, marginTop: 1 },

  // Action items
  actionCard:  { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 10, marginBottom: 6, flexDirection: 'row' },
  actionBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.slate1, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  actionBody:  { flex: 1 },
  actionTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 3 },
  actionDesc:  { fontSize: 7, color: C.slate5, lineHeight: 1.5, marginBottom: 4 },
  actionMeta:  { flexDirection: 'row', gap: 10 },
  actionPri:   { fontSize: 6, fontFamily: 'Helvetica-Bold', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, color: C.white },

  // Products table
  tblHead:  { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, marginBottom: 1 },
  tblHCell: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase' },
  tblRow:   { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.slate1 },
  tblAlt:   { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.slate1, backgroundColor: C.bg },
  tblCell:  { fontSize: 7, color: C.slate7 },

  // Comments
  aiBlock:   { backgroundColor: C.dark, borderRadius: 8, padding: 12 },
  aiTitle:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 6 },
  aiText:    { fontSize: 7, color: '#94a3b8', lineHeight: 1.6 },
  noteBlock: { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 12 },
  noteTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6 },
  noteText:  { fontSize: 7, color: C.slate6, lineHeight: 1.6 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const healthClr = (s: number) => s >= 70 ? C.emerald : s >= 45 ? C.amber : C.red;
const priClr    = (p: string) => p === 'alta' ? C.red : p === 'media' ? C.amber : C.slate5;

function HealthBar({ score, color }: { score: number; color: string }) {
  const W = 156;
  const filled = Math.max(0, Math.min(W, (score / 100) * W));
  return (
    <Svg width={W} height={4}>
      <Rect x={0} y={0} width={W} height={4} fill={C.slate1} rx={2} />
      <Rect x={0} y={0} width={filled} height={4} fill={color} rx={2} />
    </Svg>
  );
}

function PdfHeader({ subtitle }: { subtitle: string }) {
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

function PdfFooter() {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Matrice ABC — Documento riservato</Text>
      <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function ABCMatrixPDF({
  products, totalRevenue, totalProfit, weightedMargin,
  gini, paretoIndex, starRevenuePct, riskRevenuePct, belowAvgCount,
  matrix, health, enrichedActions, totalImpact, aiComment, consultantNote,
}: ABCMatrixPDFProps) {

  const SEGS: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const classARevenue = (['AA','AB','AC'] as SegmentKey[]).reduce((s, k) => s + (matrix[k]?.revenue ?? 0), 0);
  const top15 = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 15);

  return (
    <Document>

      {/* ── PAGE 1: Dashboard ──────────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader subtitle="Matrice ABC" />

        <View style={base.body}>

          {/* 4 main KPIs */}
          <Text style={base.sectionLabel}>Indicatori Principali</Text>
          <View style={S.kpiRow}>
            {([
              { label: products.length === 1 ? 'Prodotto' : 'Prodotti', val: products.length.toString(), sub: `${[...new Set(products.map(p => p.category))].length} categorie`, clr: C.dark },
              { label: 'Fatturato Totale', val: fmtEur(totalRevenue), sub: `Costo: ${fmtEur(totalRevenue - totalProfit)}`, clr: C.dark },
              { label: 'Margine Medio',    val: fmtPct(weightedMargin), sub: `Profitto: ${fmtEur(totalProfit)}`, clr: weightedMargin >= 0 ? C.emerald : C.red },
              { label: 'Star (AA)',        val: (matrix.AA?.count ?? 0).toString(), sub: `${fmtPct(starRevenuePct)} del fatturato`, clr: C.dark },
            ] as { label: string; val: string; sub: string; clr: string }[]).map(k => (
              <View key={k.label} style={S.kpiCard}>
                <Text style={S.kpiLabel}>{k.label}</Text>
                <Text style={[S.kpiVal, { color: k.clr }]}>{k.val}</Text>
                <Text style={S.kpiSub}>{k.sub}</Text>
              </View>
            ))}
          </View>

          {/* 5 secondary KPIs */}
          <Text style={base.sectionLabel}>Metriche di Portafoglio</Text>
          <View style={S.secRow}>
            {([
              { label: 'Gini',           val: gini.toFixed(2),       clr: gini > 0.6 ? C.red : C.emerald },
              { label: 'Indice Pareto',  val: fmtPct(paretoIndex),   clr: C.slate7 },
              { label: 'Fatt. Star',     val: fmtPct(starRevenuePct),clr: C.emerald },
              { label: 'Fatt. Rischio',  val: fmtPct(riskRevenuePct),clr: riskRevenuePct > 20 ? C.red : C.slate7 },
              { label: 'Sotto Media',    val: `${belowAvgCount} pr.`,clr: C.slate7 },
            ] as { label: string; val: string; clr: string }[]).map(k => (
              <View key={k.label} style={S.secCard}>
                <Text style={S.secLabel}>{k.label}</Text>
                <Text style={[S.secVal, { color: k.clr }]}>{k.val}</Text>
              </View>
            ))}
          </View>

          {/* Matrix + Health side by side */}
          <Text style={base.sectionLabel}>Matrice Fatturato × Margine</Text>
          <View style={S.twoCol}>

            {/* 3×3 grid */}
            <View style={S.matrixWrap}>
              <View style={S.matrixHead}>
                {(['Margine A','Margine B','Margine C']).map(h => (
                  <Text key={h} style={S.matrixHeadCell}>{h}</Text>
                ))}
              </View>
              {(['A','B','C'] as const).map(rev => (
                <View key={rev} style={S.matrixRow}>
                  <Text style={S.matrixRowLabel}>Fatt. {rev}</Text>
                  {(['A','B','C'] as const).map((marg, mi) => {
                    const key = `${rev}${marg}` as SegmentKey;
                    const cell = matrix[key];
                    return (
                      <View key={key} style={[mi < 2 ? S.matrixCell : S.matrixCellLast, { backgroundColor: SEG_BG[key] }]}>
                        <Text style={[S.matrixCount, { color: SEG_FILL[key] }]}>{cell?.count ?? 0}</Text>
                        <Text style={[S.matrixLabel, { color: SEG_FILL[key] }]}>{SEGMENTS[key].label}</Text>
                        <Text style={S.matrixPct}>{fmtPct(cell?.revenuePct ?? 0)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              {/* Legend */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 4 }}>
                {SEGS.filter(k => (matrix[k]?.count ?? 0) > 0).map(k => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SEG_FILL[k] }} />
                    <Text style={{ fontSize: 6, color: C.slate5 }}>{k} · {SEGMENTS[k].label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Health score panel */}
            <View style={[S.healthWrap, base.card]}>
              <Text style={[base.sectionLabel, { marginTop: 0 }]}>Health Score</Text>
              <Text style={[S.healthScore, { color: healthClr(health.total) }]}>{health.total}</Text>
              <Text style={S.healthGrade}>
                {health.total >= 80 ? 'A — Eccellente' : health.total >= 65 ? 'B — Buono' : health.total >= 45 ? 'C — Da migliorare' : 'D — Critico'}
              </Text>
              {([
                { label: 'Diversificazione', score: health.diversification },
                { label: 'Prodotti Star',    score: health.starScore       },
                { label: 'Rischio',          score: health.riskScore       },
                { label: 'Profittabilità',   score: health.profitability   },
                { label: 'Resilienza',       score: health.resilience      },
              ]).map(({ label, score }) => (
                <View key={label} style={S.healthRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={S.healthLabel}>{label}</Text>
                    <Text style={[S.healthBarVal, { color: healthClr(score) }]}>{score}/100</Text>
                  </View>
                  <HealthBar score={score} color={healthClr(score)} />
                </View>
              ))}
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.slate2 }}>
                <Text style={{ fontSize: 6.5, color: C.slate5, lineHeight: 1.5 }}>
                  Classe A: {(['AA','AB','AC'] as SegmentKey[]).reduce((s, k) => s + (matrix[k]?.count ?? 0), 0)} prod.
                  {' · '}{fmtPct(totalRevenue > 0 ? classARevenue / totalRevenue * 100 : 0)} del fatturato
                </Text>
              </View>
            </View>

          </View>
        </View>

        <PdfFooter />
      </Page>

      {/* ── PAGE 2: Action Items + Products + Comments ─────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader subtitle="Matrice ABC" />

        <View style={base.body}>

          {/* Action Items */}
          {enrichedActions.length > 0 && (
            <>
              <Text style={base.sectionLabel}>
                Action Items · {enrichedActions.length} azioni · Impatto stimato: {fmtEur(totalImpact)}
              </Text>
              {enrichedActions.slice(0, 5).map(a => (
                <View key={a.n} style={S.actionCard} wrap={false}>
                  <View style={S.actionBadge}>
                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slate6 }}>{a.n}</Text>
                  </View>
                  <View style={S.actionBody}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <Text style={[S.actionTitle, { flex: 1, marginRight: 8 }]}>{a.title}</Text>
                      <View style={[S.actionPri, { backgroundColor: priClr(a.priority) }]}>
                        <Text style={{ fontSize: 6, color: C.white, fontFamily: 'Helvetica-Bold' }}>
                          {a.priority.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={S.actionDesc}>{a.description}</Text>
                    <View style={S.actionMeta}>
                      <Text style={{ fontSize: 6.5, color: C.slate5 }}>Impatto: {fmtEur(a.impact)}</Text>
                      <Text style={{ fontSize: 6.5, color: C.slate5 }}>Prodotti: {a.products.length}</Text>
                      <Text style={{ fontSize: 6.5, color: C.slate4 }}>
                        {a.products.slice(0, 3).map(p => p.id).join(', ')}{a.products.length > 3 ? ` +${a.products.length - 3}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              {enrichedActions.length > 5 && (
                <Text style={{ fontSize: 6.5, color: C.slate4, marginBottom: 8 }}>
                  +{enrichedActions.length - 5} azioni aggiuntive non mostrate
                </Text>
              )}
            </>
          )}

          {/* Top Products Table */}
          <Text style={base.sectionLabel}>Top {top15.length} Prodotti per Fatturato</Text>
          <View style={S.tblHead}>
            {([['22%','Codice'],['30%','Descrizione'],['16%','Fatturato'],['11%','Marg %'],['14%','Profitto'],['7%','Seg']] as [string,string][]).map(([w, h]) => (
              <Text key={h} style={[S.tblHCell, { width: w }]}>{h}</Text>
            ))}
          </View>
          {top15.map((p, i) => (
            <View key={p.id} style={i % 2 === 0 ? S.tblRow : S.tblAlt}>
              <Text style={[S.tblCell, { width: '22%', color: C.slate4 }]}>{p.id}</Text>
              <Text style={[S.tblCell, { width: '30%' }]}>{p.name}</Text>
              <Text style={[S.tblCell, { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmtEur(p.revenue)}</Text>
              <Text style={[S.tblCell, { width: '11%', textAlign: 'right', fontFamily: 'Helvetica-Bold', color: p.marginPct >= weightedMargin ? C.emerald : C.red }]}>
                {fmtPct(p.marginPct)}
              </Text>
              <Text style={[S.tblCell, { width: '14%', textAlign: 'right', color: p.profit >= 0 ? C.emerald : C.red }]}>{fmtEur(p.profit)}</Text>
              <Text style={[S.tblCell, { width: '7%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: SEG_FILL[p.segment] }]}>{p.segment}</Text>
            </View>
          ))}
          {products.length > 15 && (
            <Text style={{ fontSize: 6.5, color: C.slate4, textAlign: 'center', marginTop: 5 }}>
              +{products.length - 15} prodotti non mostrati
            </Text>
          )}

          {/* Comments */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={[base.sectionLabel, { marginTop: 14 }]}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {aiComment && (
                  <View style={[S.aiBlock, { flex: 1 }]}>
                    <Text style={S.aiTitle}>Commento AI — Matrice ABC</Text>
                    <Text style={S.aiText}>{aiComment}</Text>
                    <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
                      {([
                        { label: 'Health Score', v: `${health.total}/100` },
                        { label: 'Margine Medio', v: fmtPct(weightedMargin) },
                        { label: 'Fatt. Rischio', v: fmtPct(riskRevenuePct) },
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
                    <Text style={S.noteTitle}>Note</Text>
                    <Text style={S.noteText}>{consultantNote}</Text>
                  </View>
                )}
              </View>
            </>
          )}

        </View>

        <PdfFooter />
      </Page>

    </Document>
  );
}
