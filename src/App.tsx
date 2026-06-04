import { useState } from 'react';
import Sidebar, { type TabId } from './components/layout/Sidebar';
import Header from './components/layout/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import ABCAnalysis from './pages/ABCAnalysis';
import VarianceAnalysis from './pages/VarianceAnalysis';
import BalanceAnalysis from './pages/BalanceAnalysis';
import Login from './pages/Login';

// ── Page router ───────────────────────────────────────────────────────────────
//
// Pages are rendered via a switch function (not a static module-level object).
// This ensures:
//   1. Each navigation creates a fresh React element (no stale instances).
//   2. An ErrorBoundary keyed to currentTab catches crashes inside a module
//      without unmounting App — so isAuthenticated stays true.
//
//   Sidebar  ──onTabChange──▶  App setState  ──currentTab──▶  renderPage()
//   Dashboard card ──onNavigate──▶  same setState
//

function renderPage(tab: TabId, onNavigate: (t: TabId) => void): React.ReactNode {
  switch (tab) {
    case 'dashboard': return <Dashboard onNavigate={onNavigate} />;
    case 'abc':       return <ABCAnalysis />;
    case 'variance':  return <VarianceAnalysis />;
    case 'balance':   return <BalanceAnalysis />;
  }
}

// ── Root component ────────────────────────────────────────────────────────────

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTab, setCurrentTab] = useState<TabId>('dashboard');

  if (!isAuthenticated) {
    return <Login onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      <div className="ml-64 flex flex-col min-h-screen">
        <Header currentTab={currentTab} />

        <main className="flex-1 pt-14 overflow-y-auto">
          {/*
           * key={currentTab} resets the ErrorBoundary whenever the user
           * navigates to a different tab, so the error state never bleeds
           * between modules.
           */}
          <ErrorBoundary key={currentTab}>
            {renderPage(currentTab, setCurrentTab)}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
