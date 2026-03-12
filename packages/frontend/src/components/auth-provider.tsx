"use client";

import { createContext, useContext, ReactNode } from "react";

interface AuthContextType {
  apiKey: string;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ apiKey: '', isAuthenticated: true }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return { isAuthenticated: true, apiKey: '' };
  }
  return context;
}
