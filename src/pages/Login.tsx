import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Activity,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

const API_BASE = 'http://localhost:5001/api/auth';

type Step = 'credentials' | 'otp';

interface LoginProps {
  onSuccess: (token: string, email: string) => void;
}

export default function Login({ onSuccess }: LoginProps) {
  // ── Step 1 state ────────────────────────────────────────────────────────────
  const [email,    setEmail]    = useState('admin@moro.it');
  const [password, setPassword] = useState('Password123!');
  const [showPwd,  setShowPwd]  = useState(false);

  // ── Step 2 state ────────────────────────────────────────────────────────────
  const [otp,   setOtp]   = useState<string[]>(Array(6).fill(''));
  const [timer, setTimer] = useState(120);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [step,    setStep]    = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── OTP countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp' || timer <= 0) return;
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [step, timer]);

  // ── Step 1: verify credentials → trigger OTP generation ───────────────────
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Errore di autenticazione');
      // Transition to OTP step
      setStep('otp');
      setTimer(120);
      setOtp(Array(6).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile raggiungere il server');
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const otpStr = otp.join('');
    if (otpStr.length < 6) { setError('Inserisci tutte e 6 le cifre'); return; }
    if (timer <= 0)        { setError('OTP scaduto — torna al login'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otpStr }),
      });
      const data = await res.json() as { error?: string; token?: string; user?: { email: string } };
      if (!res.ok) throw new Error(data.error ?? 'OTP non valido');
      onSuccess(data.token ?? '', data.user?.email ?? email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di verifica');
    } finally {
      setLoading(false);
    }
  }, [email, otp, timer, onSuccess]);

  // ── OTP digit input handlers ───────────────────────────────────────────────
  function handleDigitChange(idx: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[idx] = value;
    setOtp(next);
    if (value && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleDigitKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft'  && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    const next = Array.from({ length: 6 }, (_, i) => digits[i] ?? '');
    setOtp(next);
    inputRefs.current[Math.min(digits.length - 1, 5)]?.focus();
  }

  function goBack() {
    setStep('credentials');
    setError('');
    setOtp(Array(6).fill(''));
  }

  const timerMin  = Math.floor(timer / 60);
  const timerSec  = (timer % 60).toString().padStart(2, '0');
  const otpFilled = otp.join('').length === 6;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-blue-800/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-blue-900/10 blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg shadow-blue-900/60 mb-4">
            <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Moro Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Control Suite — Accesso Sicuro</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">

          {/* Step tabs */}
          <div className="flex border-b border-slate-100">
            {([
              { label: '① Credenziali', active: step === 'credentials', done: step === 'otp' },
              { label: '② Verifica OTP', active: step === 'otp',         done: false },
            ]).map(({ label, active, done }) => (
              <div
                key={label}
                className={`
                  flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all
                  ${active ? 'border-blue-600 text-blue-600'
                  : done   ? 'border-emerald-400 text-emerald-600 bg-emerald-50/50'
                           : 'border-transparent text-slate-300'}
                `}
              >
                {done ? <ShieldCheck className="inline w-3.5 h-3.5 mr-1 -mt-0.5" /> : null}
                {label}
              </div>
            ))}
          </div>

          <div className="p-8">
            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3.5 mb-6">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="leading-snug">{error}</p>
              </div>
            )}

            {/* ── Step 1: Credentials ─────────────────────────────────────── */}
            {step === 'credentials' && (
              <form onSubmit={handleLogin} className="space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required autoComplete="username"
                      className="
                        w-full pl-10 pr-4 py-3 text-sm text-slate-800
                        bg-slate-50 border border-slate-200 rounded-xl
                        focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                        transition-all placeholder:text-slate-300
                      "
                      placeholder="email@azienda.it"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoComplete="current-password"
                      className="
                        w-full pl-10 pr-11 py-3 text-sm text-slate-800
                        bg-slate-50 border border-slate-200 rounded-xl
                        focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                        transition-all
                      "
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="
                    w-full py-3.5 text-sm font-semibold rounded-xl
                    bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300
                    text-white transition-colors
                    flex items-center justify-center gap-2
                    shadow-sm shadow-blue-300/40
                  "
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Autenticazione in corso…</>
                    : <><Lock className="w-4 h-4" /> Accedi</>
                  }
                </button>
              </form>
            )}

            {/* ── Step 2: OTP ─────────────────────────────────────────────── */}
            {step === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                {/* Info box */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Terminal className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1">OTP generato sul server</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Leggi il codice a 6 cifre sulla console del server Express
                      e inseriscilo qui sotto. Puoi incollarlo direttamente nei box.
                    </p>
                  </div>
                </div>

                {/* 6 digit boxes */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">
                    Codice OTP
                  </label>
                  <div
                    className="flex gap-2.5 justify-center"
                    onPaste={handleOtpPaste}
                  >
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { inputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleDigitChange(i, e.target.value)}
                        onKeyDown={e => handleDigitKeyDown(i, e)}
                        disabled={timer <= 0}
                        className={`
                          w-11 h-14 text-center text-xl font-bold rounded-xl border-2
                          transition-all focus:outline-none select-none
                          ${timer <= 0
                            ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                            : digit
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                          }
                        `}
                      />
                    ))}
                  </div>
                </div>

                {/* Countdown timer */}
                <div className={`flex items-center justify-center gap-1.5 text-sm font-medium ${
                  timer > 30 ? 'text-slate-500'
                  : timer > 10 ? 'text-amber-500'
                  : 'text-red-500'
                }`}>
                  <KeyRound className="w-3.5 h-3.5" />
                  {timer > 0 ? (
                    <>Codice valido per{' '}
                      <span className="tabular-nums font-bold">{timerMin}:{timerSec}</span>
                    </>
                  ) : (
                    'Codice scaduto — torna al login'
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2.5">
                  <button
                    type="submit"
                    disabled={loading || timer <= 0 || !otpFilled}
                    className="
                      w-full py-3.5 text-sm font-semibold rounded-xl
                      bg-blue-600 hover:bg-blue-700
                      disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
                      text-white transition-colors
                      flex items-center justify-center gap-2
                      shadow-sm shadow-blue-300/40
                    "
                  >
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifica in corso…</>
                      : <><ShieldCheck className="w-4 h-4" /> Verifica OTP</>
                    }
                  </button>

                  <button
                    type="button"
                    onClick={goBack}
                    className="w-full py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    ← Torna al login
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Card footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-8 py-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-medium">Demo — v1.0.0</p>
            <p className="text-[10px] text-slate-400 font-mono">admin@moro.it / Password123!</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-5">
          I dati demo sono pre-compilati nel form per comodità.
        </p>
      </div>
    </div>
  );
}
