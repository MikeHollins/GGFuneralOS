'use client';

const TOKEN_KEY = 'ggfos_token';
const STAFF_KEY = 'ggfos_staff';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStaff(): { id: string; first_name: string; last_name: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STAFF_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(token: string, staff: any): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STAFF_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
