import {
  CaseType,
  Department,
  EvidenceVerdict,
  Severity,
} from './enums';

// The exact response contract (Section 6 of the problem statement).
// Field order here mirrors the spec for readability; JSON key order is not scored.
export interface AnalysisResult {
  ticket_id: string;
  relevant_transaction_id: string | null;
  evidence_verdict: EvidenceVerdict;
  case_type: CaseType;
  severity: Severity;
  department: Department;
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
  human_review_required: boolean;
  confidence?: number;
  reason_codes?: string[];
}
