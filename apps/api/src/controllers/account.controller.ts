import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { AuthService } from '../modules/auth/auth.service.js';

const displayNameSchema = z.object({ displayName: z.string() });
const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });
const sessionIdSchema = z.string().uuid();

@Controller('api/v1/account')
export class AccountController {
  public constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('me')
  public async me(@Req() request: AuthenticatedFastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store');
    return { data: await this.auth.currentAccount(authenticatedActor(request).userId) };
  }

  @Patch('me')
  public async updateMe(@Body() body: unknown, @Req() request: AuthenticatedFastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store');
    return { data: await this.auth.updateDisplayName(authenticatedActor(request).userId, displayNameSchema.parse(body).displayName) };
  }

  @Post('change-password')
  @HttpCode(204)
  public async changePassword(@Body() body: unknown, @Req() request: AuthenticatedFastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    const actor = authenticatedActor(request);
    const input = changePasswordSchema.parse(body);
    await this.auth.changePassword({ userId: actor.userId, currentPassword: input.currentPassword, newPassword: input.newPassword, requestId: actor.requestId });
  }

  @Get('sessions')
  public async sessions(@Req() request: AuthenticatedFastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store');
    const actor = authenticatedActor(request);
    return { data: await this.auth.listSessions(actor.userId, actor.sessionId ?? '') };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  public async revokeSession(@Param('sessionId') sessionId: string, @Req() request: AuthenticatedFastifyRequest, @Res({ passthrough: true }) response: FastifyReply): Promise<void> {
    response.header('Cache-Control', 'no-store');
    const actor = authenticatedActor(request);
    await this.auth.revokeSession(actor.userId, sessionIdSchema.parse(sessionId), actor.requestId);
  }
}
