import { BarChart3, TrendingUp, LineChart, LayoutDashboard, Activity } from 'lucide-react';

export type TabId = 'dashboard' | 'abc' | 'variance' | 'balance';

interface NavItem {
  id: TabId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    sublabel: 'Panoramica generale',
    icon: LayoutDashboard,
  },
  {
    id: 'abc',
    label: 'Analisi ABC',
    sublabel: 'Classificazione referenze',
    icon: BarChart3,
  },
  {
    id: 'variance',
    label: 'Varianza Marginalità',
    sublabel: 'Waterfall analysis',
    icon: TrendingUp,
  },
  {
    id: 'balance',
    label: 'Analisi Bilancio',
    sublabel: 'KPI finanziari',
    icon: LineChart,
  },
];

interface SidebarProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 flex flex-col z-20 border-r border-slate-800">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight tracking-wide">
              Moro Analytics
            </p>
            <p className="text-slate-500 text-[11px] leading-tight mt-0.5 font-medium uppercase tracking-widest">
              Control Suite
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto scrollbar-thin">
        <p className="px-3 mb-3 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
          Moduli
        </p>
        {NAV_ITEMS.map(({ id, label, sublabel, icon: Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                transition-all duration-150 group
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }
              `}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : ''}`}>
                  {label}
                </p>
                <p className={`text-[11px] truncate mt-0.5 ${
                  isActive ? 'text-blue-200' : 'text-slate-600 group-hover:text-slate-500'
                }`}>
                  {sublabel}
                </p>
              </div>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800">
        <p className="text-slate-600 text-[11px] font-medium">v1.0.0 — Demo Mode</p>
        <p className="text-slate-700 text-[10px] mt-0.5">Dati simulati attivi</p>
      </div>
    </aside>
  );
}
