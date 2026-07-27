'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  rank?: string;
  departmentId: string;
  departmentName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

const STORAGE_KEY = 'rosterdoc_auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Hydrate from localStorage on mount
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id && parsed.role) {
          setUser(parsed);
        }
      }
    } catch {
      // Corrupt storage — clear it
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((authUser: AuthUser) => {
    setUser(authUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
