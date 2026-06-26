import { Injectable } from '@nestjs/common';
import { AnalyzeTicketDto } from './dto/analyze-ticket.dto';
import { AnalysisResult } from './domain/analysis-result';
import { ReasoningEngine } from './reasoning/reasoning.engine';
import { TextBuilder } from './safety/text.builder';
import { SafetyGuard } from './safety/safety.guard';
import { GroqService } from './llm/groq.service';

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly engine: ReasoningEngine,
    private readonly textBuilder: TextBuilder,
    private readonly safety: SafetyGuard,
    private readonly groq: GroqService,
  ) {}

  async analyze(dto: AnalyzeTicketDto): Promise<AnalysisResult> {
    // 1) Deterministic decision (the scored core — never touched by the LLM).
    const decision = this.engine.analyze(dto);

    // 2) Always-safe rule-based draft.
    const draft = this.textBuilder.build(decision);

    let agentSummary = draft.agent_summary;
    let customerReply = draft.customer_reply;
    const nextAction = draft.recommended_next_action;

    // 3) Optional LLM polish — accepted only if it passes the safety guard.
    const llm = await this.groq.polish(dto.complaint, decision, draft);
    if (llm) {
      if (llm.agent_summary && llm.agent_summary.trim()) {
        agentSummary = llm.agent_summary.trim();
      }
      if (llm.customer_reply && this.safety.isReplySafe(llm.customer_reply)) {
        customerReply = llm.customer_reply.trim();
      }
    }

    // 4) Guarantee the credential-protection note where appropriate.
    if (draft.appendCredentialNote) {
      customerReply = this.safety.ensureCredentialNote(customerReply, decision.language);
    }

    // 5) Final safety assertion — if anything is unsafe, fall back to the safe rule draft.
    if (!this.safety.isReplySafe(customerReply)) {
      customerReply = draft.appendCredentialNote
        ? this.safety.ensureCredentialNote(draft.customer_reply, decision.language)
        : draft.customer_reply;
    }

    return {
      ticket_id: dto.ticket_id,
      relevant_transaction_id: decision.relevant_transaction_id,
      evidence_verdict: decision.evidence_verdict,
      case_type: decision.case_type,
      severity: decision.severity,
      department: decision.department,
      agent_summary: agentSummary,
      recommended_next_action: nextAction,
      customer_reply: customerReply,
      human_review_required: decision.human_review_required,
      confidence: round2(decision.confidence),
      reason_codes: decision.reason_codes,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
