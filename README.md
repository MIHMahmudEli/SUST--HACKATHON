# QueueStorm Investigator

AI/API SupportOps copilot for **bKash presents SUST CSE Carnival 2026 — Codex Community Hackathon (Online Preliminary)**.

A support agent copilot for a digital finance platform. It reads one customer complaint plus the customer's recent transaction history, **investigates** what actually happened (cross-checking the complaint against the data), classifies and routes the case, and drafts a **safe** reply — without ever asking for credentials or promising financial actions it cannot authorize.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Readiness probe. Returns `{"status":"ok"}`. |
| `POST` | `/analyze-ticket` | Accepts a ticket (Section 5 schema) and returns the structured analysis (Section 6 schema). |

## Tech stack

- **NestJS 11** (Node 22/24, TypeScript) — chosen for first-class request validation (DTOs + `class-validator` + `ValidationPipe`), which directly protects the **API Contract & Schema** score, plus exception filters for controlled, leak-free error responses.
- **Hybrid reasoning**: a deterministic rule engine does all evidence reasoning, classification, routing, and safety. An optional **Groq** LLM call polishes the wording only.
- No GPU, no local model weights, small multi-stage Docker image.

## How it works (architecture)

```
POST /analyze-ticket
   └─ ValidationPipe ........... 400 on malformed input, strips unknown fields
   └─ AnalyzeController ........ 422 on semantically empty complaint
        └─ ReasoningEngine ..... DETERMINISTIC core (scored fields)
        │     • language detect (en/bn/mixed, Bangla digit parsing)
        │     • phishing/social-engineering short-circuit (safety-first)
        │     • case_type via keyword scoring + transaction evidence
        │     • transaction matching (amount/type/status/recency)
        │     • evidence_verdict: consistent / inconsistent / insufficient_data
        │     • department + severity + human_review_required
        └─ TextBuilder ......... always-safe rule templates (en + bn)
        └─ GroqService ......... OPTIONAL polish, hard-timeboxed, fails to null
        └─ SafetyGuard ......... rejects unsafe LLM text, guarantees safe reply
```

The LLM **never** decides the verdict, classification, routing, or escalation. It only rewrites `agent_summary` / `customer_reply` for fluency, and its output is discarded if it fails the safety guard. With `USE_LLM=false` (or no key), the service is fully deterministic and still safe.

## Evidence reasoning logic

- **Transaction match** by amount (+ type/status/recency). Single clean match → `consistent`.
- **Inconsistent** when data contradicts the complaint (e.g. repeated past transfers to the "wrong" recipient → established-recipient pattern).
- **Insufficient_data** when the complaint is vague, or multiple transactions plausibly match different recipients — we **do not guess**, we ask for the disambiguating detail.
- **Duplicate payment** detected from data (same amount + counterparty, both completed, close in time); `relevant_transaction_id` points at the **later** (suspected duplicate) transaction.
- **Phishing** is always `critical` → `fraud_risk` → human review; empty transaction history is normal here.

## Safety logic

Enforced deterministically by `SafetyGuard`, independent of the LLM:

1. **Never asks for PIN/OTP/password/card** — a sentence is unsafe only if it both names a credential and requests it without negation (so the warning *"do not share your PIN or OTP"* is allowed). Every customer reply (except merchant/phishing tone) carries the credential-protection note, language-matched.
2. **Never promises a refund/reversal/unblock** — uses *"any eligible amount will be returned through official channels"*. Pattern-matched and rejected if violated.
3. **Never redirects to third parties** — flags phone numbers / messaging apps; directs only to official channels.
4. **Prompt-injection resistant** — the LLM system prompt ignores instructions embedded in the complaint, and the LLM cannot alter any scored field.

## MODELS

| Model | Where it runs | Why | Required? |
|---|---|---|---|
| **Groq `llama-3.1-8b-instant`** | Groq Cloud API (external HTTPS) | Polishes `agent_summary` / `customer_reply` wording (incl. Bangla). Picked for very low latency (helps p95 ≤ 5s) and high free-tier limits. | **No** — optional. |
| Rule engine (no model) | In-process | All evidence reasoning, classification, routing, safety. The scored core. | Yes |

**Model & cost reasoning:** the task is solvable without any LLM, so the rule engine carries every scored decision. Groq's free tier is used purely for nicer language; the service degrades gracefully (rule templates) on timeout, rate limit (429), or missing key, so cost and availability never affect correctness or reliability.

## Setup & run (runbook)

```bash
# 1. Install
npm install

# 2. Configure (optional — runs rule-based without it)
cp .env.example .env
# edit .env and set GROQ_API_KEY=...   (or set USE_LLM=false)

# 3a. Dev
npm run start:dev

# 3b. Prod
npm run build && npm run start:prod
```

Service listens on `0.0.0.0:${PORT:-8000}`.

### Docker

```bash
docker build -t queuestorm-team .
docker run -p 8000:8000 --env-file .env queuestorm-team
```

### Test against the public sample pack

```bash
# with the service running:
npm run test:samples
```

## Sample request / response

Request — `POST /analyze-ticket`:

```json
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to a wrong number around 2pm today.",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "transaction_history": [
    { "transaction_id": "TXN-9101", "timestamp": "2026-04-14T14:08:22Z", "type": "transfer", "amount": 5000, "counterparty": "+8801719876543", "status": "completed" }
  ]
}
```

Response:

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT via TXN-9101 to +8801719876543, which they now believe was the wrong recipient.",
  "recommended_next_action": "Verify TXN-9101 details with the customer and initiate the wrong-transfer dispute workflow per policy.",
  "customer_reply": "We have noted your concern about transaction TXN-9101. Our dispute team will review the case and contact you through official support channels. Please do not share your PIN or OTP with anyone.",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["wrong_transfer", "transaction_match"]
}
```

A generated sample output for every public case is in [`samples/sample-output.json`](samples/sample-output.json).

## Assumptions

- All data is synthetic; no real payment integration.
- Optional fields may be missing or contain values outside the documented enums; we normalize internally and never 400 on reasonable-but-imperfect input.
- Amounts are matched in BDT as provided; complaint amounts are parsed from text (ASCII + Bangla digits).

## Known limitations

- Transaction matching is amount/type/recency-based; very unusual phrasing without an amount may yield `insufficient_data` (by design — we prefer asking over guessing).
- Bangla/Banglish keyword coverage is broad but not exhaustive.
- Groq free tier can rate-limit under heavy bursts; the rule-based fallback keeps responses correct and fast when that happens.

## Secrets

No secrets are committed. `GROQ_API_KEY` is supplied via environment variables (`.env` locally, platform env vars in deployment). See `.env.example`.
