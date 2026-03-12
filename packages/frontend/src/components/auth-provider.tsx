"use client";

import { createContext, useContext, ReactNode } from "react";

interface AuthContextType {
  apiKey: string;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "er-dev-2026";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ apiKey: API_KEY, isAuthenticated: true }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
