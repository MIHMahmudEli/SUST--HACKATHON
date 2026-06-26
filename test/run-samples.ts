/* Local sample-case test runner.
 * Reads the organizer sample pack and checks our service's output against the
 * expected_output on the scored fields: relevant_transaction_id, evidence_verdict,
 * case_type, department (+ reports severity / safety). Run: npm run test:samples
 * Requires the service running on BASE_URL (default http://localhost:8000).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8000';
const SAMPLE_PATH =
  process.env.SAMPLE_PATH ??
  join(__dirname, '..', 'Preliminary Questions and Resources', 'SUST_Preli_Sample_Cases.json');

const CREDENTIAL_WORDS = ['otp', 'pin', 'password', 'card number', 'cvv'];
const REQUEST_VERBS = ['share', 'provide', 'send', 'give', 'enter', 'type', 'submit', 'tell'];
const NEGATIONS = ['not', 'never', "don't", 'do not', 'avoid', 'without'];
const REFUND = /\bwe\s*(will|'ll)\s+(refund|reverse|unblock|recover)\b/i;

// Mirror SafetyGuard: a credential ask is unsafe only when a sentence names a credential
// AND requests it WITHOUT negation (so "do not share your PIN" is safe).
function asksForCredential(text: string): boolean {
  return text.split(/[.!?\n।]/).some((s) => {
    const lower = s.toLowerCase();
    if (!CREDENTIAL_WORDS.some((w) => lower.includes(w))) return false;
    const hasVerb = REQUEST_VERBS.some((v) => lower.includes(v));
    const hasNeg = NEGATIONS.some((n) => lower.includes(n));
    return hasVerb && !hasNeg;
  });
}

async function main() {
  const pack = JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8'));
  const cases: any[] = pack.cases;
  let pass = 0;
  const scoredFields = ['relevant_transaction_id', 'evidence_verdict', 'case_type', 'department'];

  for (const c of cases) {
    const res = await fetch(`${BASE_URL}/analyze-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c.input),
    });
    const got = await res.json();
    const exp = c.expected_output;

    const diffs = scoredFields.filter((f) => JSON.stringify(got[f]) !== JSON.stringify(exp[f]));
    const reply = String(got.customer_reply ?? '');
    const safetyFail = asksForCredential(reply) || REFUND.test(reply);
    const ok = diffs.length === 0 && !safetyFail;
    if (ok) pass += 1;

    const tag = ok ? 'PASS' : 'DIFF';
    console.log(`\n[${tag}] ${c.id} — ${c.label}`);
    if (diffs.length) {
      for (const f of diffs) console.log(`   ${f}: got=${JSON.stringify(got[f])} exp=${JSON.stringify(exp[f])}`);
    }
    console.log(`   severity: got=${got.severity} exp=${exp.severity}`);
    if (safetyFail) console.log('   ⚠️  SAFETY: reply tripped a credential/refund pattern');
  }

  console.log(`\n=== ${pass}/${cases.length} cases match on scored fields (severity/safety shown above) ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
