import { TransactionDto } from '../dto/transaction.dto';
import { EvidenceVerdict } from '../domain/enums';

export interface MatchResult {
  transaction: TransactionDto | null;
  verdict: EvidenceVerdict;
  ambiguous: boolean;
  reason_codes: string[];
}

const EMPTY: MatchResult = {
  transaction: null,
  verdict: 'insufficient_data',
  ambiguous: false,
  reason_codes: ['no_transaction_history'],
};

function time(t?: string): number {
  const ms = t ? Date.parse(t) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

function byAmount(txns: TransactionDto[], amounts: number[]): TransactionDto[] {
  if (amounts.length === 0) return [];
  return txns.filter((t) => typeof t.amount === 'number' && amounts.includes(t.amount));
}

// Detect a duplicate pair: same amount + same counterparty, both completed, close in time.
// Returns the LATER transaction as the relevant one (the suspected duplicate).
export function findDuplicate(txns: TransactionDto[]): TransactionDto | null {
  const completed = txns.filter((t) => t.status === 'completed');
  for (let i = 0; i < completed.length; i += 1) {
    for (let j = i + 1; j < completed.length; j += 1) {
      const a = completed[i];
      const b = completed[j];
      if (a.amount === b.amount && a.counterparty === b.counterparty) {
        return time(a.timestamp) >= time(b.timestamp) ? a : b;
      }
    }
  }
  return null;
}

// Generic relevant-transaction resolver for non-duplicate cases.
// - one amount match  -> that txn (verdict decided by caller using status/pattern)
// - many amount matches to the SAME counterparty -> most recent, flagged for pattern check
// - many amount matches to DIFFERENT counterparties -> ambiguous, no pick
export function matchByAmount(
  txns: TransactionDto[],
  amounts: number[],
): MatchResult {
  if (!txns || txns.length === 0) return { ...EMPTY };

  const matches = byAmount(txns, amounts);

  if (matches.length === 0) {
    return {
      transaction: null,
      verdict: 'insufficient_data',
      ambiguous: false,
      reason_codes: ['no_amount_match'],
    };
  }

  if (matches.length === 1) {
    return {
      transaction: matches[0],
      verdict: 'consistent',
      ambiguous: false,
      reason_codes: ['transaction_match'],
    };
  }

  const counterparties = new Set(matches.map((m) => m.counterparty));
  const mostRecent = [...matches].sort((a, b) => time(b.timestamp) - time(a.timestamp))[0];

  if (counterparties.size === 1) {
    // Repeated transfers to the same recipient — established-recipient pattern.
    return {
      transaction: mostRecent,
      verdict: 'inconsistent',
      ambiguous: false,
      reason_codes: ['established_recipient_pattern'],
    };
  }

  // Multiple plausible matches to different recipients — do not guess.
  return {
    transaction: null,
    verdict: 'insufficient_data',
    ambiguous: true,
    reason_codes: ['ambiguous_match', 'needs_clarification'],
  };
}
