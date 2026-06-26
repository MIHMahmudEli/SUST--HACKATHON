import { Injectable } from '@nestjs/common';

// Final, deterministic safety layer. Two jobs:
//   1) Decide whether a candidate reply (esp. LLM-drafted) is safe to send.
//   2) Guarantee the credential-protection note is present on customer replies.
// Rule-built templates are safe by construction; this primarily guards LLM output and
// acts as a last assertion before the response leaves the service.

const CREDENTIAL_WORDS = [
  'otp', 'pin', 'password', 'passcode', 'pass code', 'card number', 'full card', 'cvv', 'secret code',
];
const REQUEST_VERBS = [
  'share', 'provide', 'send', 'give', 'enter', 'type', 'submit', 'tell',
  'confirm your', 'verify your', 'need your', 'what is your', 'what\'s your',
];
const NEGATIONS = ['not', 'never', "don't", 'do not', 'avoid', 'without', 'no need', 'kindly do not'];

const CREDENTIAL_NOTE_EN = ' Please do not share your PIN or OTP with anyone.';
const CREDENTIAL_NOTE_BN = ' অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।';

@Injectable()
export class SafetyGuard {
  // True only when a sentence both names a credential AND asks for it, without negation.
  asksForCredential(text: string): boolean {
    const sentences = text.split(/[.!?\n।]/);
    return sentences.some((s) => {
      const lower = s.toLowerCase();
      const namesCredential = CREDENTIAL_WORDS.some((w) => lower.includes(w));
      if (!namesCredential) return false;
      const hasVerb = REQUEST_VERBS.some((v) => lower.includes(v));
      const hasNegation = NEGATIONS.some((n) => lower.includes(n));
      return hasVerb && !hasNegation;
    });
  }

  // Unauthorized promise of a financial action. Safe phrasing ("any eligible amount will
  // be returned through official channels") must NOT trip this.
  promisesUnauthorizedAction(text: string): boolean {
    const lower = text.toLowerCase();
    const patterns = [
      /\b(we|i)\s*(will|'ll|have|are going to|are)\s+\w*\s*(refund|reverse|unblock|recover)\b/,
      /\b(refund|reversal|reversed|refunded)\s+(has been|is being|will be)\s+(processed|done|completed|approved|issued)\b/,
      /\byou will (get|receive) (a|your)?\s*(refund|reversal)\b/,
      /\bwe will (return|send back) your\b/,
    ];
    return patterns.some((p) => p.test(lower));
  }

  // Directing the customer to an unofficial third party (phone numbers / messaging apps).
  redirectsToThirdParty(text: string): boolean {
    const lower = text.toLowerCase();
    const patterns = [
      /\b(whatsapp|telegram|imo|viber)\b/,
      /\b(call|contact|dial|message|text)\b[^.!?]{0,40}(\+?8801\d{7,}|01\d{8,})/,
    ];
    return patterns.some((p) => p.test(lower));
  }

  isReplySafe(text: string): boolean {
    if (!text || !text.trim()) return false;
    return (
      !this.asksForCredential(text) &&
      !this.promisesUnauthorizedAction(text) &&
      !this.redirectsToThirdParty(text)
    );
  }

  isActionSafe(text: string): boolean {
    if (!text) return true;
    return !this.promisesUnauthorizedAction(text);
  }

  // Ensure the credential-protection note is present (skip for merchant-tone replies where
  // the caller opts out). Language-matched.
  ensureCredentialNote(text: string, language: 'en' | 'bn' | 'mixed'): string {
    const lower = text.toLowerCase();
    const alreadyHasNote =
      /\b(pin|otp|password)\b/.test(lower) || text.includes('পিন') || text.includes('ওটিপি');
    if (alreadyHasNote) return text;
    const note = language === 'bn' ? CREDENTIAL_NOTE_BN : CREDENTIAL_NOTE_EN;
    return text.trimEnd() + note;
  }
}
