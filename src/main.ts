import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  // 400 on malformed/invalid input; strip unknown fields; never crash on bad payloads.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Controlled error bodies — no stack traces or secrets leak to clients.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Bind to 0.0.0.0 so the service is reachable in containers / judge harness.
  const port = Number(process.env.PORT ?? 8000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`QueueStorm Investigator listening on :${port}`);
}

void bootstrap();
