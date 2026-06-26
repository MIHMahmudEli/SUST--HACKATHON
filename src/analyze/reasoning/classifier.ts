import { CaseType } from '../domain/enums';
import { containsAny } from './text-utils';
import { KW } from './keywords';

export interface CaseScore {
  case_type: CaseType;
  score: number;
}

// Keyword-based scoring for each case_type. The engine later reconciles this with the
// transaction evidence, so this only needs to surface plausible candidates in order.
export function scoreCaseTypes(complaint: string): CaseScore[] {
  const scores: CaseScore[] = [
    { case_type: 'phishing_or_social_engineering', score: count(complaint, KW.phishing) * 2 },
    { case_type: 'duplicate_payment', score: count(complaint, KW.duplicate_payment) * 2 },
    { case_type: 'payment_failed', score: count(complaint, KW.payment_failed) },
    { case_type: 'wrong_transfer', score: count(complaint, KW.wrong_transfer) },
    { case_type: 'agent_cash_in_issue', score: count(complaint, KW.agent_cash_in_issue) },
    { case_type: 'merchant_settlement_delay', score: count(complaint, KW.merchant_settlement_delay) },
    { case_type: 'refund_request', score: count(complaint, KW.refund_request) },
  ];
  return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

function count(complaint: string, needles: readonly string[]): number {
  const lower = complaint.toLowerCase();
  let n = 0;
  for (const needle of needles) {
    if (lower.includes(needle.toLowerCase())) n += 1;
  }
  return n;
}

export function hasPhishingSignal(complaint: string): boolean {
  return containsAny(complaint, KW.phishing as unknown as string[]);
}
