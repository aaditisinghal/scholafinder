# Scholafinder

An iMessage-native multi-agent system that helps international students find and pursue US
college scholarships: onboarding over text, live research across universities, a Tinder-style
swipe stack, and real outreach (phone + email) to admissions offices — all orchestrated by one
boss agent over [Photon's Spectrum SDK](https://photon.codes/spectrum).

See [architecture notes / build plan](../../.claude/plans) for the full design rationale.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in the keys below
```

### Required env vars (`.env`)

| Var | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) — every agent's reasoning runs through this |
| `DATABASE_URL` | Tiger Cloud connection string. Add `&uselibpqcompat=true` to the query string or you'll hit a self-signed-cert error. |
| `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` | [app.photon.codes](https://app.photon.codes) — promo code `HACKWITHPHOTON` for a free Pro month. Only needed once you switch `SPECTRUM_PROVIDER` to `imessage`; the `terminal` provider needs neither. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` / `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | ElevenLabs dashboard. The phone-number ID only exists after you import a Twilio number into ElevenLabs (Conversational AI → Phone Numbers). No calls can go out until that's done. |
| `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` | [resend.com](https://resend.com) |
| `SOLANA_REWARD_WALLET_SECRET_KEY` | A devnet keypair (`Keypair.generate()`), funded via `solana airdrop` or https://faucet.solana.com — the public devnet RPC airdrop endpoint is usually rate-limited, the web faucet is more reliable. |

## Running it

```bash
npm run db:schema      # create tables (idempotent)
npm run db:seed        # load the 12 seeded universities + placeholder fact candidates
npm run reconcile       # resolve seed candidates into scholarship_facts (needs GEMINI_API_KEY)
npm run dev:terminal    # boss agent over the terminal provider — chat with it locally, no phone needed
```

Once `SPECTRUM_PROJECT_ID`/`SECRET` are set, switch `SPECTRUM_PROVIDER=imessage` in `.env` and run
`npm run dev` to go live on a real phone number.

## How it's organized

- `src/db/` — schema, seed data, one-off runners. `scholarship_fact_candidates` → `scholarship_facts`
  is the keystone pattern: every gatherer writes candidates, only `reconciliationAgent` writes facts.
- `src/agents/` — one file per subagent in the roster (browser/call/email gatherers; reconciliation,
  true-cost, requirements, profile-match, explainer, need-aware resolvers; policy-monitor and deadline
  monitors).
- `src/boss/` — the only thing that talks to the student: onboarding question flow, swipe-card
  formatting, and the main event loop in `index.ts`.
- `src/reward/solana.ts` — devnet-only SOL transfer on "submitted".
- `src/llm.ts` — single choke point for all LLM calls (currently Gemini; swap backends here only).

## Known gaps / before the demo

- Seed data (`src/db/seed.ts`) is placeholder/best-guess, intentionally low-confidence — it's there
  to prove the reconciliation/confidence pipeline works, not as verified financial-aid facts. Run the
  browser agent against each `aid_site_url` to get real confirmed data before showing it to a real student.
- `true_cost` / `requirements_packets` tables are empty until `trueCostAgent` / `requirementsAgent` run
  for a given (student, university) pair — that happens automatically on swipe-yes in the boss agent.
- The call agent's ElevenLabs agent (`ScholarFinder Admissions Caller`) exists but needs a Twilio
  number imported in the ElevenLabs dashboard before it can place a real call.
