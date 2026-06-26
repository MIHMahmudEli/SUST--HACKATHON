import { Module } from '@nestjs/common';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';
import { ReasoningEngine } from './reasoning/reasoning.engine';
import { TextBuilder } from './safety/text.builder';
import { SafetyGuard } from './safety/safety.guard';
import { GroqService } from './llm/groq.service';

@Module({
  controllers: [AnalyzeController],
  providers: [AnalyzeService, ReasoningEngine, TextBuilder, SafetyGuard, GroqService],
})
export class AnalyzeModule {}
