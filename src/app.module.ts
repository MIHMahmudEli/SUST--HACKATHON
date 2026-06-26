import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { AnalyzeModule } from './analyze/analyze.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AnalyzeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
