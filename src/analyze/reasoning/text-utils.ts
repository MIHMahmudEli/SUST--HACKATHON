// Language detection + amount extraction, Bangla-aware.

const BANGLA_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

const BANGLA_RANGE = /[ঀ-৿]/;

export function normalizeDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => BANGLA_DIGITS[d] ?? d);
}

export function detectLanguage(complaint: string, declared?: string): 'en' | 'bn' | 'mixed' {
  if (declared === 'en' || declared === 'bn' || declared === 'mixed') return declared;
  const hasBangla = BANGLA_RANGE.test(complaint);
  const hasLatin = /[a-zA-Z]/.test(complaint);
  if (hasBangla && hasLatin) return 'mixed';
  if (hasBangla) return 'bn';
  return 'en';
}

// Pull candidate money amounts out of free text. Handles ASCII + Bangla digits,
// thousands separators (5,000), and ignores obvious non-amounts where possible.
export function extractAmounts(complaint: string): number[] {
  const text = normalizeDigits(complaint);
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}
