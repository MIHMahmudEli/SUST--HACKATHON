// Extra evidence signals pulled from complaint text: phone numbers, counterparty
// mentions, and clock hours. Used to disambiguate when multiple transactions match by
// amount. Amount remains the primary signal; these are tie-breakers / boosters.

import { TransactionDto } from '../dto/transaction.dto';
import { normalizeDigits } from './text-utils';

// Trailing 10 digits of a BD mobile (drops +880 / 0 country/trunk prefixes) for comparison.
export function normalizePhone(raw: string): string {
  const digits = normalizeDigits(raw).replace(/\D/g, '');
  return digits.slice(-10);
}

// Phone-like tokens in free text (BD mobiles: 01XXXXXXXXX, 8801..., +8801...).
export function extractPhones(complaint: string): string[] {
  const text = normalizeDigits(complaint);
  const matches = text.match(/(?:\+?880)?0?1[3-9]\d{8}/g) ?? [];
  return matches.map(normalizePhone).filter((p) => p.length === 10);
}

// Does the complaint reference this transaction's counterparty?
// - phone counterparties: compare normalized trailing digits
// - id/name counterparties (MERCHANT-7821, BILLER-DESCO, AGENT-512): match a distinctive
//   token (>=4 chars/digits) appearing in the complaint
export function mentionsCounterparty(complaint: string, counterparty?: string): boolean {
  if (!counterparty) return false;
  const lower = normalizeDigits(complaint).toLowerCase();
  const cpDigits = counterparty.replace(/\D/g, '');

  if (cpDigits.length >= 9) {
    const cpPhone = normalizePhone(counterparty);
    return extractPhones(complaint).some((p) => p === cpPhone);
  }

  const tokens = counterparty
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  return tokens.some((t) => lower.includes(t));
}

// Clock hours (0-23) referenced in the complaint. Compared directly against the UTC hour
// in transaction timestamps (the sample pack treats "2pm" as matching a 14:00Z stamp).
const PART_OF_DAY: Record<string, number> = {
  morning: 9, noon: 12, afternoon: 15, evening: 19, night: 22, midnight: 0,
  সকাল: 9, দুপুর: 12, বিকাল: 15, বিকেল: 15, সন্ধ্যা: 19, রাত: 22,
};

export function extractClockHours(complaint: string): number[] {
  const text = normalizeDigits(complaint);
  const hours = new Set<number>();

  // 12-hour with am/pm: "2pm", "2 pm", "2:30 pm"
  for (const m of text.matchAll(/\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/gi)) {
    let h = Number(m[1]) % 12;
    if (m[2].toLowerCase() === 'pm') h += 12;
    if (h >= 0 && h <= 23) hours.add(h);
  }
  // 24-hour clock: "14:08"
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) hours.add(h);
  }
  // Part-of-day words
  const lower = text.toLowerCase();
  for (const [word, h] of Object.entries(PART_OF_DAY)) {
    if (lower.includes(word)) hours.add(h);
  }
  return [...hours];
}

// UTC hour from an ISO timestamp, read directly from the string to avoid TZ shifts.
export function txnHour(timestamp?: string): number | null {
  if (!timestamp) return null;
  const m = timestamp.match(/T(\d{2}):/);
  return m ? Number(m[1]) : null;
}

export function hourMatches(txn: TransactionDto, hours: number[]): boolean {
  if (hours.length === 0) return false;
  const h = txnHour(txn.timestamp);
  return h != null && hours.includes(h);
}
