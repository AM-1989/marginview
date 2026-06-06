import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const TOKEN_KEY = 'moro_token';

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  canExport: boolean;
  allowedModules: string[] | null; // null = tutti i moduli
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setLoading(false); return; }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) { setToken(stored); setUser(data); }
        else localStorage.removeItem(TOKEN_KEY);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
