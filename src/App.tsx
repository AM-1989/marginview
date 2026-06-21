import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar, { type TabId } from './components/layout/Sidebar';
import Header from './components/layout/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import ABCMatrix from './pages/ABCMatrix';
import VarianceAnalysis from './pages/VarianceAnalysis';
import BalanceAnalysis from './pages/BalanceAnalysis';
import Login from './pages/Login';
import Settings from './pages/Settings';
import ActivateAccount from './pages/ActivateAccount';

function renderPage(tab: TabId, onNavigate: (t: TabId) => void): React.ReactNode {
  switch (tab) {
    case 'dashboard': return <Dashboard onNavigate={onNavigate} />;
    case 'abc':       return <ABCMatrix />;
    case 'variance':  return <VarianceAnalysis />;
    case 'balance':   return <BalanceAnalysis />;
    case 'settings':  return <Settings />;
  }
}

function AppShell() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabId>('dashboard');

  const activationToken = new URLSearchParams(window.location.search).get('activate');

  // Redirect a dashboard se un non-admin finisce su settings
  useEffect(() => {
    if (user && currentTab === 'settings' && user.role !== 'admin') {
      setCurrentTab('dashboard');
    }
  }, [user, currentTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (activationToken) return <ActivateAccount token={activationToken} />;
  if (!user) return <Login />;

  return (
    <div className="min-h-screen bg-[#F2F2F7] font-sans">
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      <div className="ml-64 flex flex-col min-h-screen">
        <Header currentTab={currentTab} />

        <main className="flex-1 pt-14 overflow-y-auto">
          <ErrorBoundary key={currentTab}>
            {renderPage(currentTab, setCurrentTab)}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
