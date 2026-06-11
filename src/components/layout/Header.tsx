import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  abc:       'Analisi ABC — Classificazione Referenze',
  variance:  'Varianza Marginalità — Waterfall Analysis',
  balance:   'Analisi Bilancio — KPI Finanziari',
  settings:  'Impostazioni',
};

interface HeaderProps {
  currentTab: string;
}

export default function Header({ currentTab }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-white border-b border-slate-200 z-10 flex items-center px-6 gap-4">
      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-slate-800 truncate">
          {MODULE_LABELS[currentTab] ?? currentTab}
        </h1>
      </div>


      {/* User info */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-700 leading-tight">
              {user.name ?? user.email}
            </p>
            <p className="text-[10px] leading-tight mt-0.5">
              <span className={`font-medium ${user.role === 'admin' ? 'text-blue-600' : 'text-slate-400'}`}>
                {user.role === 'admin' ? 'Admin' : 'Utente'}
              </span>
            </p>
          </div>

          <button
            onClick={logout}
            title="Esci"
            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
}
