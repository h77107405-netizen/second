import type { User } from '../types/auth';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';
const SESSION_KEY = 'auth_session';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as User;
  } catch {
    clearAuthStorage();
    return null;
  }
}

export function persistAuthState(token: string, user: User, refreshToken?: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(SESSION_KEY, 'active');
  localStorage.setItem(SESSION_KEY, 'active');
  if (refreshToken) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return;
  [TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, SESSION_KEY, 'refreshToken'].forEach((key) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });
}

export function getStoredAuthSnapshot(): { token: string | null; user: User | null } {
  return {
    token: getStoredToken(),
    user: getStoredUser(),
  };
}
