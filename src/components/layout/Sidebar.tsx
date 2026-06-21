import { BarChart3, TrendingUp, LineChart, LayoutDashboard, Activity, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type TabId = 'dashboard' | 'abc' | 'variance' | 'balance' | 'settings';

interface NavItem {
  id: TabId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

const MODULE_ITEMS: NavItem[] = [
  { id: 'abc',      label: 'Matrice ABC',          sublabel: 'Fatturato × Margine',  icon: BarChart3  },
  { id: 'variance', label: 'Varianza Marginalità',  sublabel: 'Waterfall analysis',   icon: TrendingUp },
  { id: 'balance',  label: 'Analisi Bilancio',      sublabel: 'KPI finanziari',        icon: LineChart  },
];

interface SidebarProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
}

function NavButton({
  item, isActive, onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
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
          {item.label}
        </p>
        <p className={`text-[11px] truncate mt-0.5 ${
          isActive ? 'text-blue-200' : 'text-slate-600 group-hover:text-slate-500'
        }`}>
          {item.sublabel}
        </p>
      </div>
      {isActive && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
      )}
    </button>
  );
}

export default function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const { user } = useAuth();

  const visibleModules = MODULE_ITEMS.filter(item => {
    if (!user || user.role === 'admin') return true;
    if (user.allowedModules === null) return true;
    return user.allowedModules.includes(item.id);
  });

  const dashboard: NavItem = {
    id: 'dashboard', label: 'Dashboard', sublabel: 'Panoramica generale', icon: LayoutDashboard,
  };

  const settings: NavItem = {
    id: 'settings', label: 'Impostazioni', sublabel: 'Utenti e configurazione', icon: Settings,
  };

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
              MarginView
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <p className="px-3 mb-3 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
          Moduli
        </p>

        <NavButton item={dashboard} isActive={currentTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />

        {visibleModules.map(item => (
          <NavButton
            key={item.id}
            item={item}
            isActive={currentTab === item.id}
            onClick={() => onTabChange(item.id)}
          />
        ))}

        {user?.role === 'admin' && (
          <>
            <p className="px-3 pt-5 mb-3 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              Amministrazione
            </p>
            <NavButton item={settings} isActive={currentTab === 'settings'} onClick={() => onTabChange('settings')} />
          </>
        )}
      </nav>

    </aside>
  );
}
