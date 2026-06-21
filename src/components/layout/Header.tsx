import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  abc:       'Matrice ABC',
  variance:  'Varianza Marginalità',
  balance:   'Analisi Bilancio',
  settings:  'Impostazioni',
};

interface HeaderProps {
  currentTab: string;
}

export default function Header({ currentTab }: HeaderProps) {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? 'U');

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-white/80 backdrop-blur-xl border-b border-black/[0.06] z-10 flex items-center px-6 gap-4">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[13px] font-semibold text-gray-800 truncate tracking-tight">
          {MODULE_LABELS[currentTab] ?? currentTab}
        </h1>
      </div>

      {/* User section */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <p className="text-[12px] font-semibold text-gray-700 leading-tight">
              {user.name ?? user.email}
            </p>
            <p className={`text-[10px] font-medium leading-tight mt-0.5 ${
              user.role === 'admin' ? 'text-blue-500' : 'text-gray-400'
            }`}>
              {user.role === 'admin' ? 'Amministratore' : 'Utente'}
            </p>
          </div>

          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 select-none">
            {initials}
          </div>

          <button
            onClick={logout}
            title="Esci"
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-[15px] h-[15px]" />
          </button>
        </div>
      )}
    </header>
  );
}
