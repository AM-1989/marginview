import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { EffectsResult } from '../varianceAnalysis';
import { C, base, fmtEur, today } from './pdfTheme';

export interface VariancePDFProps {
  effects:   EffectsResult;
  p1Label:   string;
  p2Label:   string;
  aiComment: string | null;
}

// ── Local formatters ─────────────────────────────────────────────────────────
const pct = (v: number | null): string =>
  v !== null && isFinite(v) ? `${(v * 100).toFixed(1)}%` : '-';
const pp = (v: number): string =>
  isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp` : '-';
const clr = (v: number) => v > 0 ? C.emerald : v < 0 ? C.red : C.slate5;

// ── Corporate palette (light — no dark backgrounds) ───────────────────────────
const CORP_LABEL = '#64748b';
const CORP_TOTAL = '#64748b';

// ── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Header / footer — light gray, dark text
  header:       { backgroundColor: C.slate1, paddingHorizontal: 32, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.slate2 },
  headerBrand:  { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.slate5, letterSpacing: 2, marginBottom: 3 },
  headerTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.slate7 },
  headerSub:    { fontSize: 8, color: C.slate5, marginTop: 3 },
  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.slate1, borderTopWidth: 1, borderTopColor: C.slate2, paddingHorizontal: 32, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand:  { fontSize: 7, color: C.slate5, fontFamily: 'Helvetica-Bold' },
  sectionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: CORP_LABEL, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7, marginTop: 18 },

  // Period strip
  strip:        { flexDirection: 'row', gap: 6 },
  periodBox:    { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 12 },
  periodLabel:  { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  periodVal:    { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 3 },
  periodSub:    { fontSize: 6.5, color: C.slate5, lineHeight: 1.5 },
  deltaCard:    { flex: 0.75, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.slate3, borderRadius: 6, padding: 12 },
  deltaVal:     { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  deltaFormula: { fontSize: 5.5, color: C.slate5, lineHeight: 1.6 },

  // Effects row
  effRow:   { flexDirection: 'row', gap: 6 },
  effCard:  { flex: 1, borderWidth: 1, borderRadius: 6, padding: 10 },
  effLabel: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 },
  effVal:   { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  effDesc:  { fontSize: 6, color: C.slate5 },

  // Waterfall
  wfRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  wfLabel: { width: 70, fontSize: 6.5, color: C.slate6 },
  wfVal:   { width: 65, textAlign: 'right', fontSize: 6.5, fontFamily: 'Helvetica-Bold' },

  // Mix table
  mixTable: { borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' },
  mixHead:  { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 5, paddingHorizontal: 8 },
  mixRow:   { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.slate1 },
  mixTotal: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: C.slate3, backgroundColor: C.slate1 },
  mixHCell: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase' },
  mixCell:  { fontSize: 7, color: C.slate7 },

  // AI block
  aiBlock: { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 12 },
  aiTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slate7, marginBottom: 6 },
  aiText:  { fontSize: 7, color: C.slate6, lineHeight: 1.6 },
});

// ── Header ───────────────────────────────────────────────────────────────────

function PdfHeader({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <View style={S.header}>
      <View style={base.headerLeft}>
        <Text style={S.headerBrand}>MARGINVIEW</Text>
        <Text style={S.headerTitle}>Analisi Varianza Marginalità</Text>
        <Text style={S.headerSub}>{p1} vs {p2} · Scomposizione effetti volume, mix, prezzo e costo</Text>
      </View>
      <View style={base.headerRight}>
        <Text style={[base.headerDate, { color: C.slate3 }]}>{today()}</Text>
      </View>
    </View>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function PdfFooter({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Analisi Varianza — {p1} vs {p2}</Text>
      <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Waterfall bar ─────────────────────────────────────────────────────────────

function EffectBar({ label, value, maxAbs, isTotal = false }: {
  label: string; value: number; maxAbs: number; isTotal?: boolean;
}) {
  const BAR_W = 180;
  const cx    = BAR_W / 2;
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const barW  = Math.max(ratio * (cx - 2), value !== 0 ? 2 : 0);
  const x     = value >= 0 ? cx : cx - barW;
  const fill  = isTotal ? CORP_TOTAL : value >= 0 ? C.emerald : C.red;
  return (
    <View style={S.wfRow}>
      <Text style={[S.wfLabel, isTotal ? { fontFamily: 'Helvetica-Bold', color: C.dark } : {}]}>{label}</Text>
      <Svg width={BAR_W} height={13}>
        <Rect x={0}          y={4} width={BAR_W} height={5} fill={C.slate1} rx={2} />
        <Rect x={cx - 0.5}  y={0} width={1}     height={13} fill={C.slate3} />
        {barW > 0 && <Rect x={x} y={3} width={barW} height={7} fill={fill} rx={2} />}
      </Svg>
      <Text style={[S.wfVal, { color: isTotal ? CORP_TOTAL : clr(value) }]}>{pp(value)}</Text>
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function VariancePDF({ effects, p1Label, p2Label, aiComment }: VariancePDFProps) {
  const delta  = effects.marginPctP2 - effects.marginPctP1;
  const md     = effects.mixDecomposition;
  const maxAbs = Math.max(
    Math.abs(effects.effVolume), Math.abs(effects.effMix),
    Math.abs(effects.effPrezzo), Math.abs(effects.effCosto),
    Math.abs(delta), 0.001,
  );

  return (
    <Document>
      <Page size="A4" style={base.page}>
        <PdfHeader p1={p1Label} p2={p2Label} />

        <View style={base.body}>

          {/* ── Confronto Periodi ─────────────────────────────────────────── */}
          <Text style={S.sectionLabel}>Confronto Periodi</Text>
          <View style={S.strip}>
            <View style={S.periodBox}>
              <Text style={S.periodLabel}>{p1Label} — Periodo Base</Text>
              <Text style={S.periodVal}>{pct(effects.marginPctP1)}</Text>
              <Text style={S.periodSub}>
                Fatturato: {fmtEur(effects.totalRev1)}{'\n'}
                Margine €: {fmtEur(effects.totalMargin1)}
              </Text>
            </View>
            <View style={S.periodBox}>
              <Text style={S.periodLabel}>{p2Label} — Periodo Confronto</Text>
              <Text style={S.periodVal}>{pct(effects.marginPctP2)}</Text>
              <Text style={S.periodSub}>
                Fatturato: {fmtEur(effects.totalRev2)}{'\n'}
                Margine €: {fmtEur(effects.totalMargin2)}
              </Text>
            </View>
            <View style={S.deltaCard}>
              <Text style={S.periodLabel}>Variazione Totale</Text>
              <Text style={[S.deltaVal, { color: clr(delta) }]}>{pp(delta)}</Text>
              <Text style={S.periodSub}>
                Δ Fatturato: {fmtEur(effects.totalRev2 - effects.totalRev1)}{'\n'}
                Δ Margine €: {fmtEur(effects.totalMargin2 - effects.totalMargin1)}
              </Text>
              <Text style={S.deltaFormula}>
                Volume ({pp(effects.effVolume)}) + Mix ({pp(effects.effMix)}){'\n'}
                + Prezzo ({pp(effects.effPrezzo)}) + Costo ({pp(effects.effCosto)})
              </Text>
            </View>
          </View>

          {/* ── Scomposizione Effetti ─────────────────────────────────────── */}
          <Text style={S.sectionLabel}>Scomposizione Effetti (punti percentuale di margine)</Text>
          <View style={S.effRow}>
            {([
              { label: 'Effetto Volume', value: effects.effVolume, desc: 'Variazione quantità vendute'  },
              { label: 'Effetto Mix',    value: effects.effMix,    desc: 'Variazione composizione mix'  },
              { label: 'Effetto Prezzo', value: effects.effPrezzo, desc: 'Variazione prezzi di vendita' },
              { label: 'Effetto Costo',  value: effects.effCosto,  desc: 'Variazione costi di acquisto' },
            ] as { label: string; value: number; desc: string }[]).map(e => (
              <View key={e.label} style={[S.effCard, {
                borderColor:     e.value > 0 ? '#a7f3d0' : e.value < 0 ? '#fecaca' : C.slate2,
                backgroundColor: e.value > 0 ? '#f0fdf4' : e.value < 0 ? '#fef2f2' : C.white,
              }]}>
                <Text style={S.effLabel}>{e.label}</Text>
                <Text style={[S.effVal, { color: clr(e.value) }]}>{pp(e.value)}</Text>
                <Text style={S.effDesc}>{e.desc}</Text>
              </View>
            ))}
          </View>

          {/* ── Contributo Visivo degli Effetti ──────────────────────────── */}
          <Text style={S.sectionLabel}>Contributo Visivo degli Effetti</Text>
          <View style={[base.card, { paddingVertical: 10, paddingHorizontal: 14 }]}>
            {([
              { label: 'Effetto Volume', value: effects.effVolume, isTotal: false },
              { label: 'Effetto Mix',    value: effects.effMix,    isTotal: false },
              { label: 'Effetto Prezzo', value: effects.effPrezzo, isTotal: false },
              { label: 'Effetto Costo',  value: effects.effCosto,  isTotal: false },
              { label: 'Δ Totale',       value: delta,             isTotal: true  },
            ] as { label: string; value: number; isTotal: boolean }[]).map(e => (
              <EffectBar key={e.label} label={e.label} value={e.value} maxAbs={maxAbs} isTotal={e.isTotal} />
            ))}
          </View>

          {/* ── Decomposizione Effetto Mix per Dimensione ─────────────────── */}
          <Text style={S.sectionLabel}>Decomposizione Effetto Mix per Dimensione</Text>
          <View style={S.mixTable}>
            <View style={S.mixHead}>
              <Text style={[S.mixHCell, { flex: 1 }]}>Dimensione</Text>
              <Text style={[S.mixHCell, { width: 90, textAlign: 'right' }]}>Contributo (pp)</Text>
              <Text style={[S.mixHCell, { width: 60, textAlign: 'right' }]}>% del Mix</Text>
            </View>
            {([
              { label: 'Mix Brand',          value: md.brand          },
              { label: 'Mix Categoria',       value: md.categoria      },
              { label: 'Mix Sottocategoria',  value: md.sottocategoria },
              { label: 'Mix Formato',         value: md.formato        },
              { label: 'Residuo (referenze)', value: md.residuo        },
            ] as { label: string; value: number }[]).map(({ label, value }) => (
              <View key={label} style={S.mixRow}>
                <Text style={[S.mixCell, { flex: 1 }]}>{label}</Text>
                <Text style={[S.mixCell, { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: clr(value) }]}>
                  {pp(value)}
                </Text>
                <Text style={[S.mixCell, { width: 60, textAlign: 'right', color: C.slate5 }]}>
                  {md.totale !== 0 ? `${(Math.abs(value / md.totale) * 100).toFixed(1)}%` : '—'}
                </Text>
              </View>
            ))}
            <View style={S.mixTotal}>
              <Text style={[S.mixCell, { flex: 1, fontFamily: 'Helvetica-Bold', color: C.dark }]}>TOTALE EFFETTO MIX</Text>
              <Text style={[S.mixCell, { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: clr(md.totale) }]}>
                {pp(md.totale)}
              </Text>
              <Text style={[S.mixCell, { width: 60, textAlign: 'right', color: C.slate5 }]}>100%</Text>
            </View>
          </View>

          {/* ── Commento AI ───────────────────────────────────────────────── */}
          {aiComment && (
            <>
              <Text style={[S.sectionLabel, { marginTop: 14 }]}>Analisi</Text>
              <View style={S.aiBlock}>
                <Text style={S.aiTitle}>Commento AI — Varianza Marginalità</Text>
                <Text style={S.aiText}>{aiComment}</Text>
              </View>
            </>
          )}

        </View>

        <PdfFooter p1={p1Label} p2={p2Label} />
      </Page>
    </Document>
  );
}
