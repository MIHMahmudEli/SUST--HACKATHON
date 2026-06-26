import { TransactionDto } from '../dto/transaction.dto';
import { EvidenceVerdict } from '../domain/enums';
import { extractClockHours, hourMatches, mentionsCounterparty } from './signals';

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

// Generic relevant-transaction resolver for non-duplicate cases. Amount is the primary
// signal; a mentioned counterparty or clock time disambiguates when several match.
// - counterparty uniquely named -> that txn (works even with no amount)
// - one amount match -> that txn
// - many amount matches: disambiguate by counterparty, then by time
// - many to SAME counterparty -> most recent, established-recipient pattern
// - still ambiguous (different recipients) -> do not guess
export function matchByAmount(
  txns: TransactionDto[],
  amounts: number[],
  complaint = '',
): MatchResult {
  if (!txns || txns.length === 0) return { ...EMPTY };

  // Strong signal: complaint names exactly one transaction's counterparty.
  const cpMatches = txns.filter((t) => mentionsCounterparty(complaint, t.counterparty));
  if (cpMatches.length === 1) {
    return {
      transaction: cpMatches[0],
      verdict: 'consistent',
      ambiguous: false,
      reason_codes: ['counterparty_match'],
    };
  }

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

  // Multiple amount matches — try to disambiguate with extra signals.
  const byCounterparty = matches.filter((t) => mentionsCounterparty(complaint, t.counterparty));
  if (byCounterparty.length === 1) {
    return {
      transaction: byCounterparty[0],
      verdict: 'consistent',
      ambiguous: false,
      reason_codes: ['amount_and_counterparty_match'],
    };
  }

  const hours = extractClockHours(complaint);
  const byTime = matches.filter((t) => hourMatches(t, hours));
  if (byTime.length === 1) {
    return {
      transaction: byTime[0],
      verdict: 'consistent',
      ambiguous: false,
      reason_codes: ['amount_and_time_match'],
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
