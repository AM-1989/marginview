import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer';
import type { EffectsResult, ComparedLine } from '../varianceAnalysis';
import { computeGroupBridge } from '../varianceAnalysis';
import { C, base, fmtEur, today } from './pdfTheme';

export interface VariancePDFProps {
  effects:        EffectsResult;
  p1Label:        string;
  p2Label:        string;
  aiComment:      string | null;
  consultantNote: string;
}

// ── Local formatters (effects are decimal: 0.023 = 2.3 pp) ──────────────────
const pct = (v: number | null): string =>
  v !== null && isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'N/D';
const pp = (v: number): string =>
  isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp` : 'N/D';
const clr = (v: number) => v > 0 ? C.emerald : v < 0 ? C.red : C.slate5;

// ── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Period strip
  strip:        { flexDirection: 'row', gap: 6 },
  periodBox:    { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 6, padding: 12 },
  periodLabel:  { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate4, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  periodVal:    { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 3 },
  periodSub:    { fontSize: 6.5, color: C.slate5, lineHeight: 1.5 },
  deltaCard:    { flex: 0.75, backgroundColor: C.dark, borderRadius: 6, padding: 12 },
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
  mixTable:   { borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' },
  mixHead:    { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 5, paddingHorizontal: 8 },
  mixRow:     { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.slate1 },
  mixTotal:   { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: C.slate3, backgroundColor: '#eff6ff' },
  mixHCell:   { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase' },
  mixCell:    { fontSize: 7, color: C.slate7 },

  // Hierarchical table
  hierTable:   { borderWidth: 1, borderColor: C.slate2, borderRadius: 6, overflow: 'hidden' },
  hierHead:    { flexDirection: 'row', backgroundColor: '#1e293b', paddingVertical: 5, paddingHorizontal: 6 },
  hierHCell:   { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: '#94a3b8', textTransform: 'uppercase' },
  hierCanale:  { flexDirection: 'row', backgroundColor: '#020617', paddingVertical: 6, paddingHorizontal: 6 },
  hierCnCell:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 0.8 },
  hierBrand:   { flexDirection: 'row', backgroundColor: '#334155', paddingVertical: 5, paddingHorizontal: 6 },
  hierBCell:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.white },
  hierCat:     { flexDirection: 'row', backgroundColor: C.bg, paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: C.slate2 },
  hierCCell:   { fontSize: 6.5, color: C.slate7 },
  hierTot:     { flexDirection: 'row', backgroundColor: '#dbeafe', paddingVertical: 6, paddingHorizontal: 6, borderTopWidth: 1.5, borderTopColor: '#93c5fd' },
  hierTCell:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#1e3a5f' },

  // Driver tables
  tblHead:  { flexDirection: 'row', backgroundColor: C.slate1, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 3, marginBottom: 1 },
  tblHCell: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: C.slate5, textTransform: 'uppercase' },
  tblRow:   { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.slate1 },
  tblAlt:   { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.slate1, backgroundColor: C.bg },
  tblCell:  { fontSize: 6.5, color: C.slate7 },

  // Comments
  aiBlock:   { backgroundColor: C.dark, borderRadius: 8, padding: 12 },
  aiTitle:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 6 },
  aiText:    { fontSize: 7, color: '#94a3b8', lineHeight: 1.6 },
  noteBlock: { backgroundColor: C.white, borderWidth: 1, borderColor: C.slate2, borderRadius: 8, padding: 12 },
  noteTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6 },
  noteText:  { fontSize: 7, color: C.slate6, lineHeight: 1.6 },
});

// ── Shared header ────────────────────────────────────────────────────────────

function PdfHeader({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <View style={base.header}>
      <View style={base.headerLeft}>
        <Text style={base.headerBrand}>MARGINVIEW</Text>
        <Text style={base.headerTitle}>Analisi Varianza Marginalità</Text>
        <Text style={base.headerSub}>{p1} vs {p2} · Scomposizione effetti volume, mix, prezzo e costo</Text>
      </View>
      <View style={base.headerRight}>
        <Text style={base.headerDate}>{today()}</Text>
      </View>
    </View>
  );
}

// ── Shared footer (dynamic page numbers) ────────────────────────────────────

function PdfFooter({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footerBrand}>MARGINVIEW</Text>
      <Text style={base.footerText}>Analisi Varianza — {p1} vs {p2}</Text>
      <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Waterfall bar ────────────────────────────────────────────────────────────

function EffectBar({ label, value, maxAbs, isTotal = false }: {
  label: string; value: number; maxAbs: number; isTotal?: boolean;
}) {
  const BAR_W = 180;
  const cx    = BAR_W / 2;
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const barW  = Math.max(ratio * (cx - 2), value !== 0 ? 2 : 0);
  const x     = value >= 0 ? cx : cx - barW;
  const fill  = isTotal ? '#3b82f6' : value >= 0 ? C.emerald : C.red;
  return (
    <View style={S.wfRow}>
      <Text style={[S.wfLabel, isTotal ? { fontFamily: 'Helvetica-Bold', color: C.dark } : {}]}>{label}</Text>
      <Svg width={BAR_W} height={13}>
        <Rect x={0}    y={4} width={BAR_W} height={5} fill={C.slate1} rx={2} />
        <Rect x={cx - 0.5} y={0} width={1} height={13} fill={C.slate3} />
        {barW > 0 && <Rect x={x} y={3} width={barW} height={7} fill={fill} rx={2} />}
      </Svg>
      <Text style={[S.wfVal, { color: isTotal ? '#3b82f6' : clr(value) }]}>{pp(value)}</Text>
    </View>
  );
}

// ── Driver table ─────────────────────────────────────────────────────────────

function DriverTable({ lines, title }: { lines: ComparedLine[]; title: string }) {
  if (!lines.length) return null;
  return (
    <>
      <Text style={[base.sectionLabel, { marginTop: 14 }]}>{title}</Text>
      <View style={S.tblHead}>
        {([['28%','Prodotto','left'],['11%','Brand','left'],['14%','M% P1','right'],['14%','M% P2','right'],['15%','Δ pp','right'],['18%','Fatt. P2','right']] as [string,string,string][]).map(([w,h,a]) => (
          <Text key={h} style={[S.tblHCell, { width: w, textAlign: a as 'left'|'right' }]}>{h}</Text>
        ))}
      </View>
      {lines.map((l, i) => (
        <View key={l.key} style={i % 2 === 0 ? S.tblRow : S.tblAlt}>
          <Text style={[S.tblCell, { width: '28%' }]}>{l.descrizione || l.codice}</Text>
          <Text style={[S.tblCell, { width: '11%' }]}>{l.brand || '—'}</Text>
          <Text style={[S.tblCell, { width: '14%', textAlign: 'right' }]}>{pct(l.marginPct1)}</Text>
          <Text style={[S.tblCell, { width: '14%', textAlign: 'right' }]}>{pct(l.marginPct2)}</Text>
          <Text style={[S.tblCell, { width: '15%', textAlign: 'right', fontFamily: 'Helvetica-Bold', color: clr(l.deltaMarginPct ?? 0) }]}>
            {l.deltaMarginPct != null ? pp(l.deltaMarginPct) : '—'}
          </Text>
          <Text style={[S.tblCell, { width: '18%', textAlign: 'right' }]}>{fmtEur(l.rev2)}</Text>
        </View>
      ))}
    </>
  );
}

// ── Main document ────────────────────────────────────────────────────────────

export default function VariancePDF({ effects, p1Label, p2Label, aiComment, consultantNote }: VariancePDFProps) {
  const delta  = effects.marginPctP2 - effects.marginPctP1;
  const md     = effects.mixDecomposition;
  const maxAbs = Math.max(
    Math.abs(effects.effVolume), Math.abs(effects.effMix),
    Math.abs(effects.effPrezzo), Math.abs(effects.effCosto),
    Math.abs(delta), 0.001,
  );

  // Build Canale → Brand → Categoria hierarchy
  const canaleMap = new Map<string, ComparedLine[]>();
  for (const l of effects.lines) {
    const cn = l.canale || 'N/D';
    if (!canaleMap.has(cn)) canaleMap.set(cn, []);
    canaleMap.get(cn)!.push(l);
  }
  const hierCanali = [...canaleMap.entries()].map(([canale, cnLines]) => {
    const brandMap = new Map<string, ComparedLine[]>();
    for (const l of cnLines) {
      const b = l.brand || 'N/D';
      if (!brandMap.has(b)) brandMap.set(b, []);
      brandMap.get(b)!.push(l);
    }
    return {
      canale,
      bridge: computeGroupBridge(cnLines),
      brands: [...brandMap.entries()].map(([brand, bLines]) => {
        const catMap = new Map<string, ComparedLine[]>();
        for (const l of bLines) {
          const c = l.categoria || 'N/D';
          if (!catMap.has(c)) catMap.set(c, []);
          catMap.get(c)!.push(l);
        }
        return {
          brand,
          bridge: computeGroupBridge(bLines),
          cats: [...catMap.entries()].map(([cat, cLines]) => ({
            cat, bridge: computeGroupBridge(cLines),
          })),
        };
      }),
    };
  });

  const totalMix = (b: ReturnType<typeof computeGroupBridge>) =>
    b.effMixCategoria + b.effMixSottocategoria + b.effMixReferenza;

  // Column widths for hierarchical table
  const H = { name: '32%', p1: '10%', vol: '10%', mix: '10%', prc: '10%', cst: '10%', p2: '10%' };

  return (
    <Document>

      {/* ── PAGE 1: Panoramica Effetti ──────────────────────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader p1={p1Label} p2={p2Label} />

        <View style={base.body}>

          {/* Period comparison */}
          <Text style={base.sectionLabel}>Confronto Periodi</Text>
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
              <Text style={[S.periodLabel, { color: C.slate4 }]}>Variazione Totale</Text>
              <Text style={[S.deltaVal, { color: clr(delta) }]}>{pp(delta)}</Text>
              <Text style={[S.periodSub, { color: C.slate5 }]}>
                Δ Fatturato: {fmtEur(effects.totalRev2 - effects.totalRev1)}{'\n'}
                Δ Margine €: {fmtEur(effects.totalMargin2 - effects.totalMargin1)}
              </Text>
              <Text style={S.deltaFormula}>
                Volume ({pp(effects.effVolume)}) + Mix ({pp(effects.effMix)}){'\n'}
                + Prezzo ({pp(effects.effPrezzo)}) + Costo ({pp(effects.effCosto)})
              </Text>
            </View>
          </View>

          {/* Effects decomposition */}
          <Text style={base.sectionLabel}>Scomposizione Effetti (punti percentuale di margine)</Text>
          <View style={S.effRow}>
            {([
              { label: 'Effetto Volume',  value: effects.effVolume,  desc: 'Variazione quantità vendute'    },
              { label: 'Effetto Mix',     value: effects.effMix,     desc: 'Variazione composizione mix'    },
              { label: 'Effetto Prezzo',  value: effects.effPrezzo,  desc: 'Variazione prezzi di vendita'   },
              { label: 'Effetto Costo',   value: effects.effCosto,   desc: 'Variazione costi di acquisto'   },
            ] as { label: string; value: number; desc: string }[]).map(e => (
              <View key={e.label} style={[S.effCard, {
                borderColor:       e.value > 0 ? '#a7f3d0' : e.value < 0 ? '#fecaca' : C.slate2,
                backgroundColor:   e.value > 0 ? '#f0fdf4' : e.value < 0 ? '#fef2f2' : C.white,
              }]}>
                <Text style={S.effLabel}>{e.label}</Text>
                <Text style={[S.effVal, { color: clr(e.value) }]}>{pp(e.value)}</Text>
                <Text style={S.effDesc}>{e.desc}</Text>
              </View>
            ))}
          </View>

          {/* Waterfall visual */}
          <Text style={base.sectionLabel}>Contributo Visivo degli Effetti</Text>
          <View style={[base.card, { paddingVertical: 10, paddingHorizontal: 14 }]}>
            {([
              { label: 'Effetto Volume',  value: effects.effVolume,  isTotal: false },
              { label: 'Effetto Mix',     value: effects.effMix,     isTotal: false },
              { label: 'Effetto Prezzo',  value: effects.effPrezzo,  isTotal: false },
              { label: 'Effetto Costo',   value: effects.effCosto,   isTotal: false },
              { label: 'Δ Totale',        value: delta,              isTotal: true  },
            ] as { label: string; value: number; isTotal: boolean }[]).map(e => (
              <EffectBar key={e.label} label={e.label} value={e.value} maxAbs={maxAbs} isTotal={e.isTotal} />
            ))}
          </View>

          {/* Mix decomposition by dimension */}
          <Text style={base.sectionLabel}>Decomposizione Effetto Mix per Dimensione</Text>
          <View style={S.mixTable}>
            <View style={S.mixHead}>
              <Text style={[S.mixHCell, { flex: 1 }]}>Dimensione</Text>
              <Text style={[S.mixHCell, { width: 90, textAlign: 'right' }]}>Contributo (pp)</Text>
              <Text style={[S.mixHCell, { width: 60, textAlign: 'right' }]}>% del Mix</Text>
            </View>
            {([
              { label: 'Mix Brand',           value: md.brand          },
              { label: 'Mix Categoria',        value: md.categoria      },
              { label: 'Mix Sottocategoria',   value: md.sottocategoria },
              { label: 'Mix Formato',          value: md.formato        },
              { label: 'Residuo (referenze)',  value: md.residuo        },
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

        </View>

        <PdfFooter p1={p1Label} p2={p2Label} />
      </Page>

      {/* ── PAGE 2: Tabella Gerarchica + Driver + Note ──────────────────────── */}
      <Page size="A4" style={base.page}>
        <PdfHeader p1={p1Label} p2={p2Label} />

        <View style={base.body}>

          {/* Hierarchical bridge table */}
          <Text style={base.sectionLabel}>Tabella Gerarchica Canale → Brand → Categoria</Text>
          <View style={S.hierTable}>
            <View style={S.hierHead}>
              {([
                [H.name, 'Etichette',  'left' ],
                [H.p1,   'Cos% P1',   'right'],
                [H.vol,  'Volume',    'right'],
                [H.mix,  'Mix',       'right'],
                [H.prc,  'Prezzo',    'right'],
                [H.cst,  'Costo',     'right'],
                [H.p2,   'Cos% P2',   'right'],
              ] as [string, string, string][]).map(([w, h, a]) => (
                <Text key={h} style={[S.hierHCell, { width: w, textAlign: a as 'left'|'right' }]}>{h}</Text>
              ))}
            </View>

            {hierCanali.map(({ canale, bridge: cnb, brands }) => (
              <View key={canale}>
                <View style={S.hierCanale}>
                  <Text style={[S.hierCnCell, { width: H.name }]}>{canale}</Text>
                  <Text style={[S.hierCnCell, { width: H.p1, textAlign: 'right', color: '#fde68a' }]}>{pct(cnb.cosP1)}</Text>
                  <Text style={[S.hierCnCell, { width: H.vol, textAlign: 'right', color: clr(cnb.effVolume) }]}>{pp(cnb.effVolume)}</Text>
                  <Text style={[S.hierCnCell, { width: H.mix, textAlign: 'right', color: clr(totalMix(cnb)) }]}>{pp(totalMix(cnb))}</Text>
                  <Text style={[S.hierCnCell, { width: H.prc, textAlign: 'right', color: clr(cnb.effPrezzo) }]}>{pp(cnb.effPrezzo)}</Text>
                  <Text style={[S.hierCnCell, { width: H.cst, textAlign: 'right', color: clr(cnb.effCosto) }]}>{pp(cnb.effCosto)}</Text>
                  <Text style={[S.hierCnCell, { width: H.p2, textAlign: 'right', color: '#fde68a' }]}>{pct(cnb.cosP2)}</Text>
                </View>
                {brands.map(({ brand, bridge: bb, cats }) => (
                  <View key={`${canale}|${brand}`}>
                    <View style={S.hierBrand}>
                      <Text style={[S.hierBCell, { width: H.name, paddingLeft: 8 }]}>{brand}</Text>
                      <Text style={[S.hierBCell, { width: H.p1, textAlign: 'right', color: '#fde68a' }]}>{pct(bb.cosP1)}</Text>
                      <Text style={[S.hierBCell, { width: H.vol, textAlign: 'right', color: clr(bb.effVolume) }]}>{pp(bb.effVolume)}</Text>
                      <Text style={[S.hierBCell, { width: H.mix, textAlign: 'right', color: clr(totalMix(bb)) }]}>{pp(totalMix(bb))}</Text>
                      <Text style={[S.hierBCell, { width: H.prc, textAlign: 'right', color: clr(bb.effPrezzo) }]}>{pp(bb.effPrezzo)}</Text>
                      <Text style={[S.hierBCell, { width: H.cst, textAlign: 'right', color: clr(bb.effCosto) }]}>{pp(bb.effCosto)}</Text>
                      <Text style={[S.hierBCell, { width: H.p2, textAlign: 'right', color: '#fde68a' }]}>{pct(bb.cosP2)}</Text>
                    </View>
                    {cats.map(({ cat, bridge: cb }) => (
                      <View key={`${canale}|${brand}|${cat}`} style={S.hierCat}>
                        <Text style={[S.hierCCell, { width: H.name, paddingLeft: 16 }]}>{cat}</Text>
                        <Text style={[S.hierCCell, { width: H.p1, textAlign: 'right', color: C.slate5 }]}>{pct(cb.cosP1)}</Text>
                        <Text style={[S.hierCCell, { width: H.vol, textAlign: 'right', color: clr(cb.effVolume) }]}>{pp(cb.effVolume)}</Text>
                        <Text style={[S.hierCCell, { width: H.mix, textAlign: 'right', color: clr(totalMix(cb)) }]}>{pp(totalMix(cb))}</Text>
                        <Text style={[S.hierCCell, { width: H.prc, textAlign: 'right', color: clr(cb.effPrezzo) }]}>{pp(cb.effPrezzo)}</Text>
                        <Text style={[S.hierCCell, { width: H.cst, textAlign: 'right', color: clr(cb.effCosto) }]}>{pp(cb.effCosto)}</Text>
                        <Text style={[S.hierCCell, { width: H.p2, textAlign: 'right', color: C.slate5 }]}>{pct(cb.cosP2)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}

            <View style={S.hierTot}>
              <Text style={[S.hierTCell, { width: H.name }]}>Totale complessivo</Text>
              <Text style={[S.hierTCell, { width: H.p1, textAlign: 'right' }]}>{pct(effects.marginPctP1)}</Text>
              <Text style={[S.hierTCell, { width: H.vol, textAlign: 'right', color: clr(effects.effVolume) }]}>{pp(effects.effVolume)}</Text>
              <Text style={[S.hierTCell, { width: H.mix, textAlign: 'right', color: clr(effects.effMix) }]}>{pp(effects.effMix)}</Text>
              <Text style={[S.hierTCell, { width: H.prc, textAlign: 'right', color: clr(effects.effPrezzo) }]}>{pp(effects.effPrezzo)}</Text>
              <Text style={[S.hierTCell, { width: H.cst, textAlign: 'right', color: clr(effects.effCosto) }]}>{pp(effects.effCosto)}</Text>
              <Text style={[S.hierTCell, { width: H.p2, textAlign: 'right' }]}>{pct(effects.marginPctP2)}</Text>
            </View>
          </View>

          {/* Driver tables */}
          <DriverTable lines={effects.topVariations.slice(0, 6)} title="Top Variazioni per Prodotto" />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 0 }}>
            <View style={{ flex: 1 }}>
              <DriverTable lines={effects.topBest.slice(0, 4)} title="Top 4 Migliori Performer" />
            </View>
            <View style={{ flex: 1 }}>
              <DriverTable lines={effects.topWorst.slice(0, 4)} title="Top 4 Peggiori Performer" />
            </View>
          </View>

          {/* AI comment + consultant note */}
          {(aiComment || consultantNote) && (
            <>
              <Text style={[base.sectionLabel, { marginTop: 14 }]}>Analisi e Note</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {aiComment && (
                  <View style={[S.aiBlock, { flex: 1 }]}>
                    <Text style={S.aiTitle}>Commento AI — Varianza Marginalità</Text>
                    <Text style={S.aiText}>{aiComment}</Text>
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

        <PdfFooter p1={p1Label} p2={p2Label} />
      </Page>

    </Document>
  );
}
