// Shared design tokens for all @react-pdf/renderer documents
import { StyleSheet } from '@react-pdf/renderer';

export const C = {
  dark:     '#0f172a',
  violet:   '#7c3aed',
  violetL:  '#ede9fe',
  emerald:  '#059669',
  emeraldL: '#ecfdf5',
  amber:    '#d97706',
  amberL:   '#fffbeb',
  red:      '#dc2626',
  redL:     '#fef2f2',
  slate9:   '#0f172a',
  slate7:   '#334155',
  slate6:   '#475569',
  slate5:   '#64748b',
  slate4:   '#94a3b8',
  slate3:   '#cbd5e1',
  slate2:   '#e2e8f0',
  slate1:   '#f1f5f9',
  bg:       '#f8fafc',
  white:    '#ffffff',
} as const;

export const SEG_FILL: Record<string, string> = {
  AA: '#059669', AB: '#d97706', AC: '#dc2626',
  BA: '#10b981', BB: '#f59e0b', BC: '#ef4444',
  CA: '#34d399', CB: '#fbbf24', CC: '#f87171',
};

export const SEG_BG: Record<string, string> = {
  AA: '#ecfdf5', AB: '#fffbeb', AC: '#fef2f2',
  BA: '#f0fdf4', BB: '#fffbeb', BC: '#fef2f2',
  CA: '#f0fdf4', CB: '#fffbeb', CC: '#fef2f2',
};

export const base = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.slate7,
    backgroundColor: C.bg,
  },
  header: {
    backgroundColor: C.dark,
    paddingHorizontal: 32,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: { flexDirection: 'column' },
  headerBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: C.violet,
    letterSpacing: 2,
    marginBottom: 3,
  },
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: C.white,
  },
  headerSub: {
    fontSize: 8,
    color: C.slate4,
    marginTop: 3,
  },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 8, color: C.slate5 },
  headerPage: { fontSize: 7, color: C.slate5, marginTop: 2 },

  body: { paddingHorizontal: 32, paddingTop: 20, paddingBottom: 20 },

  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    color: C.violet,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 7,
    marginTop: 18,
  },

  card: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate2,
    borderRadius: 6,
    padding: 10,
  },

  footer: {
    backgroundColor: C.dark,
    paddingHorizontal: 32,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  footerText: { fontSize: 7, color: C.slate5 },
  footerBrand: { fontSize: 7, color: C.violet, fontFamily: 'Helvetica-Bold' },
});

export const fmtEur = (v: number): string => {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `€${(v / 1_000).toFixed(0)}k`;
  return `€${v.toFixed(0)}`;
};
export const fmtPct = (v: number): string => `${isFinite(v) ? v.toFixed(1) : '0.0'}%`;
export const fmtX   = (v: number): string => isFinite(v) && Math.abs(v) < 99 ? `${v.toFixed(1)}x` : 'n.d.';
export const fmtPp  = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
export const today  = (): string => new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
