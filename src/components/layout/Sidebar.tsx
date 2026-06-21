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
  { id: 'abc',      label: 'Matrice ABC',         sublabel: 'Fatturato × Margine', icon: BarChart3  },
  { id: 'variance', label: 'Varianza Marginalità', sublabel: 'Waterfall analysis',  icon: TrendingUp },
  { id: 'balance',  label: 'Analisi Bilancio',     sublabel: 'KPI finanziari',       icon: LineChart  },
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
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
        transition-all duration-150
        ${isActive
          ? 'bg-white/[0.12] text-white'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
        }
      `}
    >
      <Icon
        className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
          isActive ? 'text-blue-400' : 'text-slate-500'
        }`}
        strokeWidth={isActive ? 2.25 : 1.75}
      />
      <span className={`text-[13px] font-medium tracking-tight ${isActive ? 'text-white' : ''}`}>
        {item.label}
      </span>
      {isActive && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
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
    id: 'dashboard', label: 'Dashboard', sublabel: 'Panoramica', icon: LayoutDashboard,
  };

  const settings: NavItem = {
    id: 'settings', label: 'Impostazioni', sublabel: 'Configurazione', icon: Settings,
  };

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-[#1C1C1E] flex flex-col z-20 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-white font-semibold text-[14px] leading-tight tracking-tight">
              MarginView
            </p>
            <p className="text-slate-500 text-[11px] leading-tight mt-0.5">Controllo di gestione</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <NavButton
          item={dashboard}
          isActive={currentTab === 'dashboard'}
          onClick={() => onTabChange('dashboard')}
        />

        <div className="pt-4 pb-1.5 px-3">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            Moduli
          </p>
        </div>

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
            <div className="pt-4 pb-1.5 px-3">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                Amministrazione
              </p>
            </div>
            <NavButton
              item={settings}
              isActive={currentTab === 'settings'}
              onClick={() => onTabChange('settings')}
            />
          </>
        )}
      </nav>
    </aside>
  );
}
