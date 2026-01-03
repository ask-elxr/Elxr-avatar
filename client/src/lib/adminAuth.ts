const ADMIN_SECRET_KEY = 'admin_secret';

export function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_SECRET_KEY);
}

export function setAdminSecret(secret: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_SECRET_KEY, secret);
}

export function clearAdminSecret(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_SECRET_KEY);
}

export function getAdminHeaders(): Record<string, string> {
  const secret = getAdminSecret();
  if (!secret) return {};
  return { 'X-Admin-Secret': secret };
}
