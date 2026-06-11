import { useState } from 'react';
import { Activity, Lock, Eye, EyeOff, User, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  token: string;
}

export default function ActivateAccount({ token }: Props) {
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);
  const [email,    setEmail]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Le password non coincidono.'); return; }
    if (password.length < 8)  { setError('La password deve avere almeno 8 caratteri.'); return; }

    setLoading(true);
    try {
      const res  = await fetch('/api/auth/activate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password, name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante l\'attivazione.');
      setEmail(data.email);
      setDone(true);
      // Rimuove il ?activate= dall'URL senza ricaricare la pagina
      window.history.replaceState({}, '', '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-blue-800/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-blue-900/10 blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg shadow-blue-900/60 mb-4">
            <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MarginView</h1>
          <p className="text-slate-500 text-sm mt-1">Attivazione account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          {done ? (
            <div className="p-10 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Account attivato!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Puoi ora accedere con <strong>{email}</strong> e la password scelta.
              </p>
              <a
                href="/"
                className="inline-block w-full py-3 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors text-center"
              >
                Vai al login
              </a>
            </div>
          ) : (
            <>
              <div className="px-8 pt-8 pb-2">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Benvenuto!</h2>
                <p className="text-slate-500 text-sm">Imposta la tua password per attivare l'account.</p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 pt-5 space-y-5">
                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Nome (opzionale)
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      autoComplete="name"
                      className="w-full pl-10 pr-4 py-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      placeholder="Mario Rossi"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Password <span className="text-slate-400 normal-case font-normal">(min. 8 caratteri)</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPwd ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoComplete="new-password"
                      className="w-full pl-10 pr-11 py-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Conferma password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPwd ? 'text' : 'password'} value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required autoComplete="new-password"
                      className={`w-full pl-10 pr-4 py-3 text-sm text-slate-800 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        confirm && confirm !== password
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                          : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                      }`}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white transition-colors flex items-center justify-center gap-2 shadow-sm">
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Attivazione…</>
                    : <><CheckCircle2 className="w-4 h-4" /> Attiva account</>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
