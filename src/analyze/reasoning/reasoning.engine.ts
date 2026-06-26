import { Injectable } from '@nestjs/common';
import { AnalyzeTicketDto } from '../dto/analyze-ticket.dto';
import { TransactionDto } from '../dto/transaction.dto';
import {
  CaseType,
  Department,
  EvidenceVerdict,
  Severity,
} from '../domain/enums';
import { detectLanguage, extractAmounts, stripInjection } from './text-utils';
import { hasPhishingSignal, scoreCaseTypes } from './classifier';
import { findDuplicate, matchByAmount } from './matcher';

export interface Decision {
  relevant_transaction_id: string | null;
  evidence_verdict: EvidenceVerdict;
  case_type: CaseType;
  severity: Severity;
  department: Department;
  human_review_required: boolean;
  confidence: number;
  reason_codes: string[];
  language: 'en' | 'bn' | 'mixed';
  matched: TransactionDto | null;
  amount: number | null;
}

const HIGH_VALUE_THRESHOLD = 25000;

@Injectable()
export class ReasoningEngine {
  analyze(dto: AnalyzeTicketDto): Decision {
    const rawComplaint = dto.complaint ?? '';
    const language = detectLanguage(rawComplaint, dto.language);
    // Strip embedded prompt-injection clauses before reasoning so adversarial text cannot
    // distort classification. The safety guard still validates final output regardless.
    const complaint = stripInjection(rawComplaint);
    const txns = dto.transaction_history ?? [];
    const amounts = extractAmounts(complaint);
    const base = { language, amount: amounts[0] ?? null };

    // 1) Safety first: phishing / social engineering always wins.
    if (hasPhishingSignal(complaint)) {
      return {
        ...base,
        relevant_transaction_id: null,
        evidence_verdict: 'insufficient_data',
        case_type: 'phishing_or_social_engineering',
        severity: 'critical',
        department: 'fraud_risk',
        human_review_required: true,
        confidence: 0.95,
        reason_codes: ['phishing', 'credential_protection', 'critical_escalation'],
        matched: null,
      };
    }

    const scores = scoreCaseTypes(complaint);
    const leading = scores[0]?.case_type;

    // 2) Data-driven duplicate detection (strong signal even with weak wording).
    const dup = findDuplicate(txns);
    if (leading === 'duplicate_payment' || (dup && amounts.includes(dup.amount as number))) {
      if (dup) {
        return this.build({
          ...base,
          case_type: 'duplicate_payment',
          matched: dup,
          verdict: 'consistent',
          severity: 'high',
          department: 'payments_ops',
          human_review_required: true,
          confidence: 0.9,
          reason_codes: ['duplicate_payment', 'biller_verification_required'],
        });
      }
    }

    // 3) Payment failed (with possible balance deduction).
    if (leading === 'payment_failed') {
      const amountMatch = (t: TransactionDto) =>
        amounts.length === 0 || amounts.includes(t.amount as number);
      const failed = txns.find((t) => t.type === 'payment' && amountMatch(t) && t.status === 'failed');
      // Complaint asserts failure but the matching payment actually completed -> contradiction.
      const completedMatch = txns.find(
        (t) => t.type === 'payment' && amountMatch(t) && t.status === 'completed',
      );
      const anyMatch = failed ?? completedMatch ?? txns.find(amountMatch) ?? null;
      const verdict: EvidenceVerdict = !anyMatch
        ? 'insufficient_data'
        : failed
          ? 'consistent'
          : completedMatch
            ? 'inconsistent'
            : 'consistent';
      return this.build({
        ...base,
        case_type: 'payment_failed',
        matched: anyMatch,
        verdict,
        severity: 'high',
        department: 'payments_ops',
        human_review_required: this.highValue(anyMatch) || verdict === 'inconsistent',
        confidence: !anyMatch ? 0.55 : verdict === 'inconsistent' ? 0.7 : 0.88,
        reason_codes: !anyMatch
          ? ['payment_failed', 'no_amount_match']
          : verdict === 'inconsistent'
            ? ['payment_failed', 'status_contradiction']
            : ['payment_failed', 'potential_balance_deduction'],
      });
    }

    // 4) Agent cash-in (or cash-out) not reflected.
    if (leading === 'agent_cash_in_issue') {
      const cashIn = txns.find(
        (t) =>
          (t.type === 'cash_in' || t.type === 'cash_out') &&
          (amounts.length === 0 || amounts.includes(t.amount as number)),
      ) ?? null;
      return this.build({
        ...base,
        case_type: 'agent_cash_in_issue',
        matched: cashIn,
        verdict: cashIn ? 'consistent' : 'insufficient_data',
        severity: 'high',
        department: 'agent_operations',
        human_review_required: true,
        confidence: cashIn ? 0.88 : 0.6,
        reason_codes: cashIn
          ? ['agent_cash_in', 'pending_transaction', 'agent_ops']
          : ['agent_cash_in', 'no_transaction_match'],
      });
    }

    // 5) Merchant settlement delay.
    if (leading === 'merchant_settlement_delay' || dto.user_type === 'merchant') {
      const settlement = txns.find(
        (t) => t.type === 'settlement' && (amounts.length === 0 || amounts.includes(t.amount as number)),
      ) ?? null;
      if (settlement || leading === 'merchant_settlement_delay') {
        return this.build({
          ...base,
          case_type: 'merchant_settlement_delay',
          matched: settlement,
          verdict: settlement ? 'consistent' : 'insufficient_data',
          severity: 'medium',
          department: 'merchant_operations',
          human_review_required: false,
          confidence: settlement ? 0.9 : 0.6,
          reason_codes: settlement
            ? ['merchant_settlement', 'delay', 'pending']
            : ['merchant_settlement', 'no_transaction_match'],
        });
      }
    }

    // 6) Wrong transfer.
    if (leading === 'wrong_transfer') {
      const m = matchByAmount(txns, amounts, complaint);
      let verdict: EvidenceVerdict = m.verdict;
      const reasonCodes = [...m.reason_codes];

      // Established-recipient check: even on a single amount match, repeated transfers to
      // the same counterparty contradict a "wrong recipient" claim.
      if (m.transaction && verdict === 'consistent') {
        const cp = m.transaction.counterparty;
        const sameRecipient = txns.filter(
          (t) => t.counterparty === cp && (t.type === 'transfer' || t.type === undefined),
        ).length;
        if (sameRecipient > 1) {
          verdict = 'inconsistent';
          reasonCodes.push('established_recipient_pattern');
        }
      }

      const severity: Severity = verdict === 'consistent' ? 'high' : 'medium';
      return this.build({
        ...base,
        case_type: 'wrong_transfer',
        matched: m.transaction,
        verdict,
        severity,
        department: 'dispute_resolution',
        human_review_required: !m.ambiguous, // ambiguous -> ask first, no review yet
        confidence: verdict === 'consistent' ? 0.9 : m.ambiguous ? 0.65 : 0.75,
        reason_codes: ['wrong_transfer', ...reasonCodes],
      });
    }

    // 7) Refund request (change of mind / merchant-policy dependent).
    if (leading === 'refund_request') {
      const m = matchByAmount(txns, amounts, complaint);
      return this.build({
        ...base,
        case_type: 'refund_request',
        matched: m.transaction,
        verdict: m.transaction ? 'consistent' : 'insufficient_data',
        severity: 'low',
        department: 'customer_support',
        human_review_required: false,
        confidence: m.transaction ? 0.85 : 0.6,
        reason_codes: ['refund_request', 'merchant_policy_dependent'],
      });
    }

    // 8) Fallback: vague / unclassifiable.
    return this.build({
      ...base,
      case_type: 'other',
      matched: null,
      verdict: 'insufficient_data',
      severity: 'low',
      department: 'customer_support',
      human_review_required: false,
      confidence: 0.6,
      reason_codes: ['vague_complaint', 'needs_clarification'],
    });
  }

  private highValue(t: TransactionDto | null): boolean {
    return !!t && typeof t.amount === 'number' && t.amount >= HIGH_VALUE_THRESHOLD;
  }

  private build(p: {
    language: 'en' | 'bn' | 'mixed';
    amount: number | null;
    case_type: CaseType;
    matched: TransactionDto | null;
    verdict: EvidenceVerdict;
    severity: Severity;
    department: Department;
    human_review_required: boolean;
    confidence: number;
    reason_codes: string[];
  }): Decision {
    // Escalate to human review whenever evidence contradicts the complaint.
    const human = p.human_review_required || p.verdict === 'inconsistent' || this.highValue(p.matched);
    return {
      language: p.language,
      amount: p.amount,
      relevant_transaction_id: p.matched ? p.matched.transaction_id : null,
      evidence_verdict: p.verdict,
      case_type: p.case_type,
      severity: p.severity,
      department: p.department,
      human_review_required: human,
      confidence: p.confidence,
      reason_codes: p.reason_codes,
      matched: p.matched,
    };
  }
}
