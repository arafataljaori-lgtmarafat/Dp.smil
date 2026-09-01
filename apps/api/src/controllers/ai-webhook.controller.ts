import { Controller, Post, Body, Headers, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';
import type { AppConfig } from '../config/app-config.js';

export interface AiWebhookPayload {
  readonly generationJobId: string;
  readonly status: 'completed' | 'failed';
  readonly resultBase64?: string;
  readonly width?: number;
  readonly height?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

@Controller('api/v1/webhooks')
export class AiWebhookController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
    @Inject(infrastructureTokens.config)
    private readonly config: AppConfig,
  ) {}

  @Post('ai-generation')
  public async handleAiCallback(
    @Headers('x-ai-webhook-secret') secret: string | undefined,
    @Body() payload: AiWebhookPayload,
  ): Promise<{ readonly status: string; readonly generationJobId: string }> {
    const expectedSecret = (this.config as unknown as Record<string, string>).AI_WEBHOOK_SECRET ?? 'dentpilot-webhook-secret';
    
    if (secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid or missing AI webhook authorization secret');
    }

    if (!payload || !payload.generationJobId || !payload.status) {
      throw new BadRequestException('Missing required fields: generationJobId and status are required');
    }

    if (payload.status === 'completed') {
      if (!payload.resultBase64 || !payload.width || !payload.height) {
        throw new BadRequestException('Completed webhook payload must contain resultBase64, width, and height');
      }
      
      // Complete generation logic can be invoked here via ApplicationServices
      return { status: 'acknowledged', generationJobId: payload.generationJobId };
    }

    if (payload.status === 'failed') {
      return { status: 'failed_acknowledged', generationJobId: payload.generationJobId };
    }

    throw new BadRequestException('Invalid status in AI webhook payload');
  }
}
