import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/authentication.guard.js';

@Controller('api/v1')
export class HealthController {
  @Public()
  @Get('health')
  public health(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}
