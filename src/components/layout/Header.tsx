import { Building2, ChevronDown, Bell } from 'lucide-react';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  abc: 'Analisi ABC — Classificazione Referenze',
  variance: 'Varianza Marginalità — Waterfall Analysis',
  balance: 'Analisi Bilancio — KPI Finanziari',
};

interface HeaderProps {
  currentTab: string;
}

export default function Header({ currentTab }: HeaderProps) {
  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-white border-b border-slate-200 z-10 flex items-center px-6 gap-4">
      {/* Breadcrumb / Module name */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-slate-800 truncate">
          {MODULE_LABELS[currentTab] ?? currentTab}
        </h1>
      </div>

      {/* Notification bell (cosmetic) */}
      <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-200" />

      {/* Company selector */}
      <button className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all group">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
          Moro Group S.p.A.
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
      </button>
    </header>
  );
}
