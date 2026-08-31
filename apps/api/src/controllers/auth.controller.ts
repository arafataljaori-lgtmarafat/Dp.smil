import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Public } from '../common/authentication.guard.js';
import { AuthService } from '../modules/auth/auth.service.js';

const registerSchema = z.object({ email: z.string(), password: z.string(), displayName: z.string() });
const loginSchema = z.object({ email: z.string(), password: z.string() });
const tokenSchema = z.object({ token: z.string().min(1).max(512) });
const emailSchema = z.object({ email: z.string() });
const resetSchema = z.object({ resetToken: z.string().min(1).max(512), newPassword: z.string() });

@Controller('api/v1/auth')
export class AuthController {
  public constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  public async register(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store');
    const registered = await this.auth.register({ ...registerSchema.parse(body), clientIp: request.ip, requestId: request.id });
    return { data: { id: registered.id, email: registered.email, status: registered.status } };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  public async verifyEmail(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    await this.auth.verifyEmail({ ...tokenSchema.parse(body), clientIp: request.ip, requestId: request.id });
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  public async resendVerification(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    await this.auth.resendVerification({ ...emailSchema.parse(body), clientIp: request.ip, requestId: request.id });
  }

  @Public()
  @Post('login')
  public async login(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store');
    const session = await this.auth.login({ ...loginSchema.parse(body), clientIp: request.ip, requestId: request.id });
    return { data: { token: session.token, sessionId: session.sessionId, expiresAt: session.expiresAt.toISOString() } };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  public async forgotPassword(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    await this.auth.forgotPassword({ ...emailSchema.parse(body), clientIp: request.ip, requestId: request.id });
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  public async resetPassword(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    const input = resetSchema.parse(body);
    await this.auth.resetPassword({ token: input.resetToken, newPassword: input.newPassword, clientIp: request.ip, requestId: request.id });
  }

  @Post('logout')
  @HttpCode(204)
  public async logout(@Req() request: FastifyRequest & { authActor?: { userId: string; sessionId?: string; requestId: string } }, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    const actor = request.authActor;
    if (!actor?.sessionId) return;
    await this.auth.logout(actor.userId, actor.sessionId, actor.requestId);
  }

  @Post('logout-all')
  @HttpCode(204)
  public async logoutAll(@Req() request: FastifyRequest & { authActor?: { userId: string; requestId: string } }, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    const actor = request.authActor;
    if (actor) await this.auth.logoutAll(actor.userId, actor.requestId);
  }
}
