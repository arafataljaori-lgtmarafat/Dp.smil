import {
  accountResponseSchema,
  actionTokenRequestSchema,
  changePasswordRequestSchema,
  emailRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  registrationResponseSchema,
  resetPasswordRequestSchema,
  sessionListResponseSchema,
  type AccountDto,
  type AuthSessionDto,
  type LoginRequest,
  type RegisterRequest,
} from '@dentpilot/contracts';
import { z } from 'zod';

import { apiRequest, apiRequestVoid } from '../api/api-transport';

const jsonHeaders = { 'Content-Type': 'application/json' } as const;

export const authApi = {
  async register(input: RegisterRequest): Promise<{ readonly id: string; readonly email: string }> {
    const payload = registrationResponseSchema.parse(await apiRequest('/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(input) }, registrationResponseSchema, { protected: false }));
    return { id: payload.data.id, email: payload.data.email };
  },

  verifyEmail(token: string): Promise<void> {
    return apiRequestVoid('/auth/verify-email', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(actionTokenRequestSchema.parse({ token })) }, { protected: false });
  },

  resendVerification(email: string): Promise<void> {
    return apiRequestVoid('/auth/resend-verification', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(emailRequestSchema.parse({ email })) }, { protected: false });
  },

  async login(input: LoginRequest): Promise<{ readonly token: string }> {
    const payload = loginResponseSchema.parse(await apiRequest('/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(loginRequestSchema.parse(input)) }, loginResponseSchema, { protected: false }));
    return { token: payload.data.token };
  },

  logout(): Promise<void> {
    return apiRequestVoid('/auth/logout', { method: 'POST' }, { protected: true });
  },

  logoutAll(): Promise<void> {
    return apiRequestVoid('/auth/logout-all', { method: 'POST' }, { protected: true });
  },

  forgotPassword(email: string): Promise<void> {
    return apiRequestVoid('/auth/forgot-password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(emailRequestSchema.parse({ email })) }, { protected: false });
  },

  resetPassword(resetToken: string, newPassword: string): Promise<void> {
    return apiRequestVoid('/auth/reset-password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(resetPasswordRequestSchema.parse({ resetToken, newPassword })) }, { protected: false });
  },

  async currentAccount(): Promise<AccountDto> {
    return accountResponseSchema.parse(await apiRequest('/account/me', { method: 'GET' }, accountResponseSchema, { protected: true })).data;
  },

  async updateDisplayName(displayName: string): Promise<AccountDto> {
    return accountResponseSchema.parse(await apiRequest('/account/me', { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ displayName }) }, accountResponseSchema, { protected: true })).data;
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return apiRequestVoid('/account/change-password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(changePasswordRequestSchema.parse({ currentPassword, newPassword })) }, { protected: true });
  },

  async listSessions(): Promise<readonly AuthSessionDto[]> {
    return sessionListResponseSchema.parse(await apiRequest('/account/sessions', { method: 'GET' }, sessionListResponseSchema, { protected: true })).data;
  },

  revokeSession(sessionId: string): Promise<void> {
    return apiRequestVoid(`/account/sessions/${z.string().uuid().parse(sessionId)}`, { method: 'DELETE' }, { protected: true });
  },
};

export type AuthApi = typeof authApi;
