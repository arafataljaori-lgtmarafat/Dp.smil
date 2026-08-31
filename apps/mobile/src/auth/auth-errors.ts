import { MobileApiError } from '../api/api-transport';

export type AuthUiError = { readonly message: string; readonly retryAfterSeconds?: number };

export function toAuthUiError(error: unknown): AuthUiError {
  if (!(error instanceof MobileApiError)) return { message: 'Something unexpected happened. Please retry.' };
  if (error.code === 'API_NOT_CONFIGURED') return { message: 'This Web preview is not connected to a DentPilot API. Configure EXPO_PUBLIC_API_BASE_URL and rebuild.' };
  if (error.code === 'NETWORK_ERROR') return { message: 'The service is unavailable. Check your connection and retry.' };
  if (error.code === 'INVALID_CREDENTIALS') return { message: 'Email or password is not correct.' };
  if (error.code === 'ACCOUNT_NOT_VERIFIED') return { message: 'Verify your email before signing in.' };
  if (error.code === 'ACCOUNT_DISABLED') return { message: 'This account is unavailable.' };
  if (error.code === 'RATE_LIMITED') {
    return error.retryAfterSeconds === undefined
      ? { message: 'Too many attempts. Please wait before retrying.' }
      : { message: 'Too many attempts. Please wait before retrying.', retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error.code === 'ACTION_TOKEN_EXPIRED') return { message: 'This link has expired. Request a new one.' };
  if (error.code === 'INVALID_ACTION_TOKEN') return { message: 'This link is invalid or has already been used.' };
  if (error.code === 'EMAIL_DELIVERY_UNAVAILABLE') return { message: 'Email delivery is temporarily unavailable. Please retry later.' };
  return { message: 'Your request could not be completed. Please retry.' };
}
