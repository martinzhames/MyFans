import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { StartupProbeService } from './health/startup-probe.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validateRequiredSecrets } from './common/secrets-validation';
import { CorsService } from './common/services/cors.service';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';

async function bootstrap() {
  validateRequiredSecrets();

  const corsService = new CorsService();
  const corsOptions = corsService.getCorsOptions();

  const app = await NestFactory.create(AppModule, {
    cors: corsOptions,
  });

  // Helmet provides a secure baseline for HTTP response headers.
  // Our custom SecurityHeadersMiddleware runs after helmet and overrides
  // specific directives (CSP, HSTS, cross-origin policies) with
  // environment-aware values.
  app.use(
    helmet({
      // CSP is managed by SecurityHeadersMiddleware with env-aware directives.
      contentSecurityPolicy: false,
      // HSTS is managed by SecurityHeadersMiddleware (production-only).
      strictTransportSecurity: false,
    }),
  );

  // Apply environment-aware security headers (CSP, HSTS, cross-origin policies).
  const securityHeadersMiddleware = new SecurityHeadersMiddleware();
  app.use((req, res, next) => securityHeadersMiddleware.use(req, res, next));

  app.use(cookieParser());

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const probeService = app.get(StartupProbeService);

  // Setup Swagger/OpenAPI documentation
  const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
  const config = new DocumentBuilder()
    .setTitle('MyFans API')
    .setDescription('MyFans backend REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  let dbResult: { ok: boolean; error?: string };
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    dbResult = await probeService.probeDb(() => dataSource.query('SELECT 1'));
  } catch {
    dbResult = { ok: true };
  }
  probeService.handleResult('DB', dbResult);

  const rpcResult = await probeService.probeRpc();
  probeService.handleResult('RPC', rpcResult);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
