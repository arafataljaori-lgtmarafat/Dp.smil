import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { loadAppConfig } from './config/app-config.js';

export async function bootstrap(): Promise<NestFastifyApplication> {
  const config = loadAppConfig();
  const adapter = new FastifyAdapter({
    logger: false,
    trustProxy: config.TRUST_PROXY,
    genReqId: () => randomUUID(),
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(config), adapter, { bufferLogs: true });
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, {
    origin: (origin, callback) => callback(null, origin === undefined || config.CORS_ALLOWED_ORIGIN_LIST.includes(origin)),
    credentials: false,
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.MAX_MEDIA_BYTES },
    throwFileSizeLimit: false,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(config.API_PORT, config.API_HOST);
  return app;
}

void bootstrap();
