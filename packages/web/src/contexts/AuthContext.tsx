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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
  }, []);

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
