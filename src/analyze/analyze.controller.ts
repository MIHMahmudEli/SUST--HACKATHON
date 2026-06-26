import { Body, Controller, HttpCode, Post, UnprocessableEntityException } from '@nestjs/common';
import { AnalyzeTicketDto } from './dto/analyze-ticket.dto';
import { AnalyzeService } from './analyze.service';
import { AnalysisResult } from './domain/analysis-result';

@Controller()
export class AnalyzeController {
  constructor(private readonly service: AnalyzeService) {}

  @Post('analyze-ticket')
  @HttpCode(200)
  async analyze(@Body() dto: AnalyzeTicketDto): Promise<AnalysisResult> {
    // Schema validation (400) is handled by the global ValidationPipe.
    // Semantic validation (422): valid shape but unusable content.
    if (!dto.complaint || !dto.complaint.trim()) {
      throw new UnprocessableEntityException('complaint must not be empty');
    }
    return this.service.analyze(dto);
  }
}
