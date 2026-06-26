// Language detection, amount extraction (digits + number words), injection stripping.
// Bangla / Banglish aware.

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

// --- Number-word parsing (English + Bangla + Banglish) -------------------------------
// Maps each word to either a unit value (<1000) or a multiplier (hundred/thousand/lakh).
const UNIT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Banglish units
  ek: 1, dui: 2, tin: 3, char: 4, panch: 5, pach: 5, choy: 6, chhoy: 6, shat: 7, sat: 7,
  aat: 8, at: 8, noy: 9, noi: 9, dosh: 10, dos: 10,
  // Bangla units (common amounts)
  'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'পাচ': 5, 'ছয়': 6, 'সাত': 7,
  'আট': 8, 'নয়': 9, 'দশ': 10, 'বিশ': 20, 'পঞ্চাশ': 50,
};

const MULTIPLIER_WORDS: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, lakhs: 100000, million: 1000000,
  // Banglish
  shoto: 100, sho: 100, hazar: 1000, hajar: 1000, lak: 100000,
  // Bangla
  'শত': 100, 'শ': 100, 'হাজার': 1000, 'লাখ': 100000, 'লক্ষ': 100000, 'মিলিয়ন': 1000000,
};

// Tokenize keeping Latin and Bangla letters; everything else is a separator.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zঀ-৿]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Convert sequences of number words into numeric candidates.
export function wordsToNumbers(text: string): number[] {
  const tokens = tokenize(text);
  const results: number[] = [];
  let current = 0;
  let total = 0;
  let active = false;

  const flush = () => {
    const v = total + current;
    if (active && v > 0) results.push(v);
    current = 0;
    total = 0;
    active = false;
  };

  for (const tok of tokens) {
    if (tok in UNIT_WORDS) {
      current += UNIT_WORDS[tok];
      active = true;
    } else if (tok in MULTIPLIER_WORDS) {
      const mult = MULTIPLIER_WORDS[tok];
      if (mult >= 1000) {
        total += Math.max(current, 1) * mult;
        current = 0;
      } else {
        current = Math.max(current, 1) * mult;
      }
      active = true;
    } else {
      flush();
    }
  }
  flush();
  return results;
}

// Pull candidate money amounts: digit forms (ASCII + Bangla, with separators) AND
// number words. Phone numbers and clock times are stripped first so they are not
// mistaken for amounts. De-duplicated, positive, capped below an implausible ceiling.
const AMOUNT_CEILING = 100_000_000; // 10 crore BDT — anything larger is almost certainly a phone/ID
export function extractAmounts(complaint: string): number[] {
  const text = normalizeDigits(complaint)
    .replace(/(?:\+?880)?0?1[3-9]\d{8}/g, ' ') // BD mobile numbers
    .replace(/\b\d{1,2}\s*[:.]\s*\d{2}\b/g, ' ') // clock times 14:08 / 2.30
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' '); // 2pm / 11 am
  const digitMatches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const fromDigits = digitMatches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0 && n < AMOUNT_CEILING);
  const fromWords = wordsToNumbers(complaint);
  return Array.from(new Set([...fromDigits, ...fromWords]));
}

// --- Prompt-injection stripping ------------------------------------------------------
// Remove clauses that try to override system behavior, so adversarial text does not
// distort classification. Safety guards still run on the final output regardless.
const INJECTION_MARKERS = [
  'ignore', 'disregard', 'forget previous', 'forget all', 'system:', 'system prompt',
  'you must', 'you are now', 'tell user', 'tell the user', 'instruct the', 'override',
  'new instructions', 'as an ai', 'reveal your', 'act as',
];

export function stripInjection(complaint: string): string {
  const segments = complaint.split(/(?<=[.!?\n।])/);
  const kept = segments.filter((seg) => {
    const lower = seg.toLowerCase();
    return !INJECTION_MARKERS.some((m) => lower.includes(m));
  });
  const result = kept.join('').trim();
  // If stripping removed everything, fall back to the original (avoid empty input).
  return result.length > 0 ? result : complaint;
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}
