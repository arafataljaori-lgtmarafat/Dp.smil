import * as Linking from 'expo-linking';

export type AuthActionLink =
  | { readonly kind: 'verify-email'; readonly token: string }
  | { readonly kind: 'reset-password'; readonly token: string }
  | null;

export function parseAuthActionLink(url: string): AuthActionLink {
  const parsed = Linking.parse(url);
  const path = (parsed.path ?? '').replace(/^\/+|\/+$/g, '');
  const purpose = typeof parsed.queryParams?.purpose === 'string' ? parsed.queryParams.purpose : undefined;
  const token = typeof parsed.queryParams?.token === 'string' ? parsed.queryParams.token : undefined;
  if (!token || token.length < 32 || token.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(token)) return null;
  if (path === 'auth/action' || path === 'action') {
    if (purpose === 'verify_email') return { kind: 'verify-email', token };
    if (purpose === 'reset_password') return { kind: 'reset-password', token };
  }
  return null;
}
