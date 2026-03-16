import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { authMe, authLogout, authRefresh } from '../lib/api.js';

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  /** When true, AuthProvider skips its initial session check (used during verify flow) */
  suppressInitialCheck: boolean;
  setSuppressInitialCheck: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suppressInitialCheck, setSuppressInitialCheck] = useState(false);

  useEffect(() => {
    // When the verify page is active it handles auth itself — skip the
    // automatic session check so a 401 from authMe() doesn't flash an error.
    if (suppressInitialCheck) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      try {
        const me = await authMe();
        if (!cancelled) {
          if (me) {
            setUser(me);
          } else {
            // 401 or no session — try refresh before giving up
            try {
              await authRefresh();
              const retryMe = await authMe();
              if (!cancelled) setUser(retryMe);
            } catch {
              if (!cancelled) setUser(null);
            }
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, [suppressInitialCheck]);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      logout,
      setUser,
      suppressInitialCheck,
      setSuppressInitialCheck,
    }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
