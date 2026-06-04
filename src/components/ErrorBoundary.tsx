import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** key should change when you want to auto-reset (e.g. key={currentTab}) */
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Component crash:', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Errore nel modulo</h3>
              <p className="text-xs text-slate-400 mt-0.5">Il componente ha generato un errore durante il rendering</p>
            </div>
          </div>

          {this.state.error && (
            <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-red-600 font-mono overflow-auto max-h-40 mb-5 leading-relaxed">
              {this.state.error.message}
            </pre>
          )}

          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Riprova
          </button>
        </div>
      </div>
    );
  }
}
