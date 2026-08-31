import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { HumanActorContext } from '@dentpilot/domain';
import type { FastifyRequest } from 'fastify';

import { UnauthenticatedError } from '@dentpilot/domain';

import { AuthService } from '../modules/auth/auth.service.js';

export const PUBLIC_ROUTE = 'dentpilot:public-route';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

export type AuthenticatedFastifyRequest = FastifyRequest & { authActor?: HumanActorContext };

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new UnauthenticatedError('Bearer authentication is required.');
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthenticatedError('Bearer token is empty.');
    const session = await this.auth.authenticateBearer(token, request.id);
    request.authActor = { actorType: 'human', userId: session.userId, sessionId: session.sessionId, requestId: session.requestId };
    return true;
  }
}

export function authenticatedActor(request: AuthenticatedFastifyRequest): HumanActorContext {
  if (!request.authActor) throw new UnauthenticatedError('Authenticated actor is missing.');
  return request.authActor;
}
