import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { clearAuthStorage, getStoredAuthSnapshot, persistAuthState } from '../lib/auth';
import { AuthContextType, User } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { token, user: cachedUser } = getStoredAuthSnapshot();
        if (cachedUser) {
          setUser(cachedUser);
        }

        if (!token) {
          clearAuthStorage();
          setUser(null);
          return;
        }

        let res = await api.auth.me();
        if (res.success && res.data) {
          const nextUser = res.data as User;
          persistAuthState(token, nextUser);
          setUser(nextUser);
        } else {
          const refreshed = await api.auth.refresh();
          if (refreshed.success && refreshed.token) {
            persistAuthState(refreshed.token, cachedUser || (await api.auth.me()).data as User);
            const fresh = (await api.auth.me()).data as User;
            setUser(fresh);
          } else {
            clearAuthStorage();
            setUser(null);
          }
        }
      } catch {
        clearAuthStorage();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void checkSession();
  }, []);

  const login = async (email: string, password: string) => {
    if (isLoading) return undefined;

    setIsLoading(true);
    try {
      const res = await api.auth.login(email, password);
      const nextUser = res.user as User;
      persistAuthState(res.token, nextUser, res.refreshToken);
      setUser(nextUser);
      toast.success(`Welcome back, ${nextUser.name}!`);
      return nextUser;
    } catch (error: any) {
      clearAuthStorage();
      setUser(null);
      toast.error(error.message || 'Login failed. Please check your credentials.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearAuthStorage();
    setUser(null);
    toast.info('Logged out successfully');
    if (typeof window !== 'undefined') {
      window.location.replace('/login');
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.data) {
        const nextUser = res.data as User;
        const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || sessionStorage.getItem('token') || localStorage.getItem('token');
        if (token) {
          persistAuthState(token, nextUser);
        }
        setUser(nextUser);
      }
    } catch {
      clearAuthStorage();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
