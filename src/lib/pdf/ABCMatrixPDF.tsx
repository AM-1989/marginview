import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { ClassifiedRow, SegmentKey, RotazioneRating } from '../abcMatrixCalc';
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
  aiBlock:   { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 12 },
  aiTitle:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slate7, marginBottom: 6 },
  aiText:    { fontSize: 7, color: C.slate6, lineHeight: 1.6 },

  // Header / footer overrides (no dark bg)
  header:      { backgroundColor: C.slate1, paddingHorizontal: 32, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.slate2 },
  headerBrand: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.slate5, letterSpacing: 2, marginBottom: 3 },
  headerTitle: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.slate7 },
  headerSub:   { fontSize: 8, color: C.slate5, marginTop: 3 },
  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.slate1, borderTopWidth: 1, borderTopColor: C.slate2, paddingHorizontal: 32, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand: { fontSize: 7, color: C.slate5, fontFamily: 'Helvetica-Bold' },
  secLabel2:   { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7, marginTop: 18 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const healthClr = (s: number) => s >= 70 ? C.emerald : s >= 45 ? C.amber : C.red;

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
    <View style={S.header}>
      <View style={base.headerLeft}>
        <Text style={S.headerBrand}>MARGINVIEW</Text>
        <Text style={S.headerTitle}>{subtitle}</Text>
        <Text style={S.headerSub}>Analisi Fatturato × Margine · Classificazione Prodotti</Text>
      </View>
      <View style={base.headerRight}>
        <Text style={[base.headerDate, { color: C.slate5 }]}>{today()}</Text>
      </View>
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Matrice ABC — Documento riservato</Text>
      <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function ABCMatrixPDF({
  products, totalRevenue, totalProfit, weightedMargin,
  gini, paretoIndex, starRevenuePct, riskRevenuePct, belowAvgCount,
  matrix, health, aiComment,
}: ABCMatrixPDFProps) {

  const SEGS: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const SEGMENT_ORDER: SegmentKey[] = ['AA','AB','AC','BA','BB','BC','CA','CB','CC'];
  const classARevenue = (['AA','AB','AC'] as SegmentKey[]).reduce((s, k) => s + (matrix[k]?.revenue ?? 0), 0);
  // Giacenza section — only when data is present
  const hasGiacenza = products.some(p => p.giacenza !== undefined);
  const giacenzaProducts = hasGiacenza
    ? [...products]
        .filter(p => p.giacenza !== undefined)
        .sort((a, b) => {
          const si = SEGMENT_ORDER.indexOf(a.segment) - SEGMENT_ORDER.indexOf(b.segment);
          return si !== 0 ? si : b.revenue - a.revenue;
        })
    : [];

  const rotLabel = (r?: RotazioneRating) => {
    if (r === 'A') return 'A · veloce';
    if (r === 'B') return 'B · media';
    if (r === 'C') return 'C · lenta';
    return '-';
  };
  const rotClr = (r?: RotazioneRating) =>
    r === 'A' ? C.emerald : r === 'C' ? C.red : r === 'B' ? C.amber : C.slate5;

  return (
    <Document>

      {/* ── PAGE 1: Dashboard ──────────────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader subtitle="Matrice ABC" />

        <View style={base.body}>

          {/* 4 main KPIs */}
          <Text style={S.secLabel2}>Indicatori Principali</Text>
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
          <Text style={S.secLabel2}>Metriche di Portafoglio</Text>
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
          <Text style={S.secLabel2}>Matrice Fatturato × Margine</Text>
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
              <Text style={[S.secLabel2, { marginTop: 0 }]}>Health Score</Text>
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

          {/* AI comment — break forces new page so text has full height to flow */}
          {aiComment && (
            <View break>
              <Text style={S.secLabel2}>Analisi</Text>
              <View style={S.aiBlock}>
                <Text style={S.aiTitle}>Commento AI — Matrice ABC</Text>
                <Text style={S.aiText}>{aiComment}</Text>
                <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.slate2 }}>
                  {([
                    { label: 'Health Score',   v: `${health.total}/100` },
                    { label: 'Margine Medio',  v: fmtPct(weightedMargin) },
                    { label: 'Fatt. Rischio',  v: fmtPct(riskRevenuePct) },
                  ]).map(({ label, v }) => (
                    <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 6, color: C.slate5, marginBottom: 2 }}>{label}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.slate7 }}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

        </View>

        <PdfFooter />
      </Page>

      {/* ── PAGE 3: Dettaglio giacenza e rotazione (solo se dati presenti) ─── */}
      {hasGiacenza && (
        <Page size="A4" style={base.page}>
          <PdfHeader subtitle="Dettaglio Giacenza e Rotazione" />

          <View style={base.body}>
            <Text style={S.secLabel2}>
              Dettaglio giacenza e rotazione · {giacenzaProducts.length} prodotti con dati di magazzino
            </Text>

            {/* Table header */}
            <View style={S.tblHead}>
              {([
                ['14%', 'Codice'],
                ['21%', 'Descrizione'],
                ['13%', 'Categoria'],
                ['10%', 'Brand'],
                ['12%', 'Giacenza (€)'],
                ['10%', 'Giorni'],
                ['12%', 'Rotazione'],
                ['8%',  'Rating'],
              ] as [string, string][]).map(([w, h]) => (
                <Text key={h} style={[S.tblHCell, { width: w }]}>{h}</Text>
              ))}
            </View>

            {/* Data rows */}
            {giacenzaProducts.map((p, i) => (
              <View key={p.id || i} style={i % 2 === 0 ? S.tblRow : S.tblAlt} wrap={false}>
                <Text style={[S.tblCell, { width: '14%', color: C.slate4 }]}>{p.id || '-'}</Text>
                <Text style={[S.tblCell, { width: '21%' }]}>{p.name || '-'}</Text>
                <Text style={[S.tblCell, { width: '13%', color: C.slate5 }]}>{p.category || '-'}</Text>
                <Text style={[S.tblCell, { width: '10%', color: C.slate5 }]}>{p.brand || '-'}</Text>
                <Text style={[S.tblCell, { width: '12%', textAlign: 'right' }]}>
                  {p.giacenza !== undefined ? fmtEur(p.giacenza) : '-'}
                </Text>
                <Text style={[S.tblCell, { width: '10%', textAlign: 'right' }]}>
                  {p.giorniGiacenza !== undefined ? `${Math.round(p.giorniGiacenza)} gg` : '-'}
                </Text>
                <Text style={[S.tblCell, { width: '12%', textAlign: 'center', color: rotClr(p.ratingRotazione) }]}>
                  {rotLabel(p.ratingRotazione)}
                </Text>
                <Text style={[S.tblCell, { width: '8%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: SEG_FILL[p.segment] }]}>
                  {p.ratingComplessivo ?? p.segment}
                </Text>
              </View>
            ))}

            {/* Note legenda rotazione */}
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.slate2 }}>
              <Text style={{ fontSize: 6, color: C.slate4 }}>
                Rotazione: A · veloce = giorni di giacenza &lt; soglia A &nbsp;|&nbsp; B · media = tra soglia A e C &nbsp;|&nbsp; C · lenta = giorni di giacenza ≥ soglia C
              </Text>
              <Text style={{ fontSize: 6, color: C.slate4, marginTop: 3 }}>
                Rating complessivo = Rating Fatturato × Rating Margine × Rating Rotazione (es. AAA = ottimo su tutti e tre gli assi)
              </Text>
            </View>
          </View>

          <PdfFooter />
        </Page>
      )}

    </Document>
  );
}
