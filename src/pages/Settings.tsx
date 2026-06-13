import { useState, useEffect, useCallback } from 'react';
import {
  Users, PlusCircle, Pencil, Ban, CheckCircle2, Mail,
  X, Loader2, AlertCircle, ShieldCheck, User,
} from 'lucide-react';
import { useAuth, type AuthUser } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow extends AuthUser {
  active: boolean;
  pendingActivation: boolean;
}

const MODULES = [
  { id: 'abc',      label: 'Matrice ABC' },
  { id: 'variance', label: 'Varianza Marginalità' },
  { id: 'balance',  label: 'Analisi Bilancio' },
];

// ── Small reusable components ─────────────────────────────────────────────────

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700',
    slate:  'bg-slate-100 text-slate-600',
    green:  'bg-emerald-100 text-emerald-700',
    red:    'bg-red-100 text-red-600',
    amber:  'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[color]}`}>
      {children}
    </span>
  );
}

// ── User modal (create / edit) ────────────────────────────────────────────────

interface ModalProps {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}

function UserModal({ user, onClose, onSaved, token }: ModalProps) {
  const isEdit = !!user;

  const [name,           setName]           = useState(user?.name ?? '');
  const [email,          setEmail]          = useState(user?.email ?? '');
  const [role,           setRole]           = useState<'admin' | 'user'>(user?.role ?? 'user');
  const [canExport,      setCanExport]      = useState(user?.canExport ?? true);
  const [modules,        setModules]        = useState<string[]>(
    user?.allowedModules ?? MODULES.map(m => m.id)
  );
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [activationUrl,  setActivationUrl]  = useState('');
  const [emailFailed,    setEmailFailed]    = useState(false);

  function toggleModule(id: string) {
    setModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  const allModules = modules.length === MODULES.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const body = {
      name:           name.trim() || undefined,
      email,
      role,
      canExport,
      allowedModules: role === 'admin'
        ? null
        : allModules ? null : modules,
    };

    try {
      const url    = isEdit ? `/api/admin/users/${user!.id}` : '/api/admin/users';
      const method = isEdit ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // User was created but email delivery failed: show activation URL manually
      if (!res.ok && data.activationUrl) {
        setActivationUrl(data.activationUrl);
        setEmailFailed(true);
        onSaved(); // reload list — user IS in the DB
        return;
      }

      if (!res.ok) throw new Error(data.error ?? 'Errore imprevisto.');

      if (!isEdit && data.activationUrl) {
        setActivationUrl(data.activationUrl);
        onSaved(); // reload list immediately even while showing the URL
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              {isEdit ? 'Modifica utente' : 'Nuovo utente'}
            </h2>
          </div>
          <button
            onClick={() => { onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Activation link — shown in DEMO_MODE or when email delivery fails */}
        {activationUrl && (
          <div className="px-6 py-5">
            <div className={`rounded-xl p-4 mb-4 ${emailFailed ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={`text-xs font-semibold mb-1 ${emailFailed ? 'text-amber-700' : 'text-blue-700'}`}>
                {emailFailed
                  ? 'Utente creato — errore invio email, copia il link manualmente'
                  : 'Utente creato — copia il link di attivazione'
                }
              </p>
              <p className={`text-[11px] mb-3 ${emailFailed ? 'text-amber-600' : 'text-blue-600'}`}>
                {emailFailed
                  ? "L'email di attivazione non è stata inviata (errore SMTP). Copia il link e invialo all'utente."
                  : "In modalità demo l'email non viene inviata. Copia e apri questo link per attivare l'account."
                }
              </p>
              <input
                readOnly
                value={activationUrl}
                onClick={e => (e.target as HTMLInputElement).select()}
                className={`w-full text-xs bg-white rounded-lg px-3 py-2 font-mono select-all border ${emailFailed ? 'border-amber-200 text-amber-900' : 'border-blue-200 text-blue-800'}`}
              />
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Chiudi
            </button>
          </div>
        )}

        {!activationUrl && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Nome */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Nome
              </label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Mario Rossi"
                className="w-full px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="utente@azienda.it"
                disabled={isEdit}
                className="w-full px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {/* Ruolo */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Ruolo
              </label>
              <div className="flex gap-2">
                {(['admin', 'user'] as const).map(r => (
                  <button
                    key={r} type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                      role === r
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {r === 'admin' ? '🔑 Admin' : '👤 Utente'}
                  </button>
                ))}
              </div>
            </div>

            {/* Permessi (solo per ruolo utente) */}
            {role === 'user' && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Moduli accessibili
                </p>
                {MODULES.map(m => (
                  <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={modules.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                      {m.label}
                    </span>
                  </label>
                ))}

                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Esportazione
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={canExport}
                      onChange={e => setCanExport(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">Permetti esportazione dati</span>
                  </label>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Annulla
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white transition-colors flex items-center justify-center gap-2">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvataggio…</>
                  : isEdit ? 'Salva modifiche' : 'Crea utente'
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { token, user: me } = useAuth();
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState<'create' | UserRow | null>(null);
  const [action,  setAction]  = useState<string>('');

  const apiFetch = useCallback((url: string, opts?: RequestInit) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts?.headers ?? {}),
      },
    }), [token]);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await apiFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore caricamento utenti.');
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function toggleActive(u: UserRow) {
    setAction(`toggle-${u.id}`);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore.');
    } finally {
      setAction('');
    }
  }

  async function resendActivation(u: UserRow) {
    setAction(`resend-${u.id}`);
    try {
      const res  = await apiFetch(`/api/admin/users/${u.id}/resend-activation`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.activationUrl) {
        prompt('Link di attivazione (DEMO MODE):', data.activationUrl);
      } else {
        alert('Email di attivazione inviata.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore.');
    } finally {
      setAction('');
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Impostazioni</h1>
        <p className="text-slate-500 text-sm mt-1">Gestione accessi e configurazione piattaforma</p>
      </div>

      {/* Users section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Utenti</p>
              <p className="text-[11px] text-slate-400">{users.length} account registrati</p>
            </div>
          </div>
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm shadow-blue-200"
          >
            <PlusCircle className="w-4 h-4" />
            Nuovo utente
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-16">Nessun utente trovato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Nome', 'Email', 'Ruolo', 'Moduli', 'Export', 'Stato', 'Azioni'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const isSelf = u.id === me?.id;
                  const spinning = action === `toggle-${u.id}` || action === `resend-${u.id}`;
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50/50 transition-colors ${!u.active ? 'opacity-60' : ''}`}>
                      {/* Nome */}
                      <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap">
                        {u.name ?? <span className="text-slate-400 italic">—</span>}
                        {isSelf && <span className="ml-1.5 text-[10px] text-blue-500 font-semibold">(tu)</span>}
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 text-slate-600">{u.email}</td>

                      {/* Ruolo */}
                      <td className="px-4 py-3.5">
                        <Badge color={u.role === 'admin' ? 'blue' : 'slate'}>
                          {u.role === 'admin'
                            ? <><ShieldCheck className="w-3 h-3 mr-1" />Admin</>
                            : <><User className="w-3 h-3 mr-1" />Utente</>
                          }
                        </Badge>
                      </td>

                      {/* Moduli */}
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        {u.role === 'admin' || u.allowedModules === null
                          ? <span className="text-slate-400 text-xs">Tutti</span>
                          : u.allowedModules.length === 0
                            ? <span className="text-red-400 text-xs">Nessuno</span>
                            : <span className="text-xs">{u.allowedModules.join(', ')}</span>
                        }
                      </td>

                      {/* Export */}
                      <td className="px-4 py-3.5">
                        {u.role === 'admin' || u.canExport
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Ban className="w-4 h-4 text-slate-300" />
                        }
                      </td>

                      {/* Stato */}
                      <td className="px-4 py-3.5">
                        {u.pendingActivation
                          ? <Badge color="amber">Da attivare</Badge>
                          : u.active
                            ? <Badge color="green">Attivo</Badge>
                            : <Badge color="red">Disabilitato</Badge>
                        }
                      </td>

                      {/* Azioni */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          {/* Modifica */}
                          <button
                            onClick={() => setModal(u)}
                            title="Modifica"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Reinvia attivazione */}
                          {u.pendingActivation && (
                            <button
                              onClick={() => resendActivation(u)}
                              disabled={spinning}
                              title="Reinvia email attivazione"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                            >
                              {spinning && action === `resend-${u.id}`
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Mail className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}

                          {/* Abilita / Disabilita */}
                          {!isSelf && !u.pendingActivation && (
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={spinning}
                              title={u.active ? 'Disabilita' : 'Abilita'}
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                u.active
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {spinning && action === `toggle-${u.id}`
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : u.active
                                  ? <Ban className="w-3.5 h-3.5" />
                                  : <CheckCircle2 className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== null && (
        <UserModal
          user={modal === 'create' ? null : modal}
          token={token!}
          onClose={() => setModal(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}
