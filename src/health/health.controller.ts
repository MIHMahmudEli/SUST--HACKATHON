import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  // Must return {"status":"ok"} within 60s of service start (judge readiness probe).
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
