# Scholafinder

**An agent that finds the US universities that will actually pay for an international student to attend — then calls, emails, and follows up with their admissions office, over iMessage.**

🔗 Live app: [scholafinder.vercel.app](https://scholafinder.vercel.app) · Live agent dashboard: [scholafinder.vercel.app/orchestration](https://scholafinder.vercel.app/orchestration) · Code: [github.com/aaditisinghal/scholafinder](https://github.com/aaditisinghal/scholafinder) · Domain (GoDaddy): **rizzmytuition.biz**

---

## Inspiration

I only know the Presidential Scholarship exists — the thing that makes a US degree financially possible for an international student — because a neighbor happened to mention it. Not a counselor, not a school website, not a search engine. A hallway conversation.

That's the actual shape of the problem. Full and near-full scholarships for international undergrads exist at hundreds of US universities, but there is no single place that lists them. A student has to check thousands of individual financial-aid pages by hand, and half of those pages never even say whether the aid applies to international students at all. Calling admissions from abroad means international call rates, an 8–12 hour time-zone gap, and an office that's closed when you're awake. Emailing works, eventually — a real reply takes four to five weeks. And the single costliest mistake, applying for aid at a school that's *need-aware* rather than *need-blind* for internationals (which can quietly lower your admission odds), is almost never disclosed anywhere a 17-year-old would think to look.

The students this hits hardest are exactly the ones with the least institutional support around them — first-generation applicants, families navigating a second country's financial-aid system in a second language, kids who don't have a neighbor who happens to know. I built Scholafinder because this isn't a search problem a better search engine fixes. It's an information-access and labor problem — someone has to read the pages, reconcile the contradictions, and make the calls — and that's exactly the kind of work a coordinated team of agents can take off a student's plate.

## What it does

Scholafinder is a **boss agent that lives in iMessage.** No app to download, no account to create, nothing new to learn — a student just starts texting.

1. **Onboarding.** The student answers seven short questions (culture, setting, aid type, ranking band, subject focus, SAT/IELTS) over iMessage. Answers are written straight into Tiger Cloud Postgres as structured preferences.
2. **Research.** A Browser Gatherer agent scrapes live financial-aid pages across the university list. A Reconciliation Agent resolves contradictions between sources into one trustworthy fact per data point — with a confidence score and a provenance trail, never a silent guess.
3. **The swipe deck.** A Profile-Match Agent ranks a personalized shortlist. The student gets a text with a link, and swipes yes/no, Tinder-style, on a web deck that shows the real detail behind each school: setting, ranking, aid type, net cost, eligibility, deadlines, and a contact.
4. **Outreach, with consent.** On a yes-swipe, an Explainer Agent writes a plain-language card. When the student reports they've actually applied, the system asks what they specifically want asked before it calls or emails admissions on their behalf — and it waits for an answer (or a bounded timeout) before acting on it.
5. **Real contact.** A Call Agent (ElevenLabs Conversational AI) and an Email Agent (Resend) reach the admissions office directly, asking the student's actual questions. An Outreach Outcome Agent texts back what admissions said, in plain language.
6. **The safety net.** A Policy-Monitor Agent rechecks facts for drift so nothing goes stale. A Need-Aware Flag Agent warns before a need-aware application quietly costs admission odds. A Deadline Agent reminds the student in time, not after.
7. **The reward.** The moment a student reports a submitted application, a Solana Reward Agent sends a small, real devnet token to their wallet — a tiny, immediate acknowledgment of the hardest part being done.

Every one of those steps is a separate, independently observable agent — not one long prompt pretending to be a product. You can watch all of it happen live at [scholafinder.vercel.app/orchestration](https://scholafinder.vercel.app/orchestration).

## How we built it

**Architecture — the student-facing surface:**

```
 ┌─────────────┐        ┌──────────────────┐
 │   iMessage    │◄──────►│  Photon Spectrum   │
 │ (student's    │        │  SDK (spectrum-ts)  │
 │  real phone)  │        └─────────┬───────────┘
 └─────────────┘                    │
                                     ▼
 ┌───────────────┐        ┌───────────────────────────┐
 │ Web swipe deck │◄──────►│   BOSS AGENT                │
 │ (React/Vite,   │  REST  │   Node.js / TypeScript,     │
 │  on Vercel)    │        │   persistent process         │
 └───────────────┘        └──────────┬────────────────────┘
                                      │ dispatches
        ┌─────────────────┬──────────┴───────┬───────────────┐
        ▼                 ▼                  ▼               ▼
 ┌─────────────┐  ┌───────────────┐  ┌──────────────┐  ┌───────────┐
 │  GATHERERS    │  │  RESOLVERS      │  │  MONITORS      │  │  REWARD     │
 │  Browser      │  │  Reconciliation │  │  Policy         │  │  Solana     │
 │  Call         │  │  True-Cost      │  │  Deadline       │  │  Reward     │
 │  Email        │  │  Requirements   │  │  Outreach-Cust. │  │  Dispatcher │
 │               │  │  Profile-Match  │  │  Outreach-Out.  │  │             │
 │               │  │  Explainer      │  │                 │  │             │
 │               │  │  Need-Aware     │  │                 │  │             │
 └──────┬────────┘  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘
        │                    │                    │                  │
        └───────────┬────────┴────────┬───────────┴──────────────────┘
                     ▼                 ▼
          ┌─────────────────────┐  ┌──────────────────────┐
          │ Tiger Cloud Postgres │  │ Google Gemini          │
          │ (TimescaleDB), 13    │  │ (gemini-2.5-flash) via │
          │ tables, real FKs,    │  │ Vertex AI on GCP       │
          │ confidence+provenance│  └──────────────────────┘
          └─────────────────────┘
                     ▲                 ▲
                     │                 │
           ┌─────────┴───────┐ ┌───────┴─────────┐
           │ ElevenLabs        │ │ Resend           │
           │ (calls + TTS)     │ │ (send + inbound) │
           └───────────────────┘ └──────────────────┘
                                          ▲
                                          │
                                 ┌────────┴────────┐
                                 │ Solana (devnet)  │
                                 └─────────────────┘
```

**Student journey:**

```
Student texts in
      │
      ▼
Boss Agent — 7-question onboarding ──► Tiger Data: preferences
      │
      ▼
Browser Gatherer scrapes live aid pages
      │
      ▼
Reconciliation Agent resolves conflicting sources
      │
      ▼
Profile-Match Agent ranks a personal swipe stack
      │
      ▼
Student swipes yes/no on the web deck ───► (background) Policy-Monitor rechecks facts
      │ yes                                 (background) Need-Aware Flag Agent warns
      ▼                                     (background) Deadline Agent reminds in time
True-Cost Agent computes the real net cost
      │
      ▼
Explainer Agent writes a plain-language card
      │
      ▼
Outreach Customization Agent asks what to ask admissions
      │
      ▼
Student reply, or a 10-minute window closes
      │
      ▼
Call Agent + Email Agent contact admissions directly
      │
      ▼
Outreach Outcome Agent texts back what admissions said
      │
      ▼ (student later submits)
Solana Reward Agent sends a small devnet token
```

**Stack:**

| Layer | What's used |
|---|---|
| Language / runtime | TypeScript end to end, Node.js (ESM), `tsx` |
| Messaging | Photon's **Spectrum SDK** (`spectrum-ts`) — the live iMessage transport and session layer the entire student-facing surface runs on |
| AI reasoning | Google **Gemini** (`gemini-2.5-flash`) via **Vertex AI on Google Cloud** — structured, schema-constrained extraction and token-streamed prose generation, with automatic retry on transient failures |
| Database | **Tiger Cloud Postgres** (TimescaleDB) — thirteen relational tables with real foreign keys, confidence scores, and provenance arrays |
| Voice | **ElevenLabs** Conversational AI for outbound admissions calls, plus Text-to-Speech for demo playback |
| Email | **Resend** for outbound send and **Resend Inbound** — admissions replies land on a Svix-signature-verified webhook that routes back to the exact outreach record that triggered it |
| Payments | **Solana** devnet via `@solana/web3.js` — real on-chain transfers |
| Frontend | React 19, TypeScript, Vite, Framer Motion for the swipe-deck gestures |
| Scraping | Playwright |
| Hosting | **Vercel** for the web app and API; the boss agent runs as its own persistent process, because it holds a live iMessage session and a cron schedule that a serverless function architecturally can't |
| Scheduling | `node-cron` for deadline reminders and nightly policy re-checks |

**The agent roster.** The idea started as eleven agents on a whiteboard. What's actually deployed is a boss agent orchestrating **fourteen** specialized subagents, each a real, independently invocable function writing to real database tables — three more than the original plan, because building the thing surfaced gaps the plan hadn't (profile-ranked swipe order, a plain-language explainer step, and a dedicated need-aware/need-blind warning didn't exist in version one, and the system was visibly worse without them):

- **Gatherers** — Browser, Call, Email
- **Resolvers** — Reconciliation (the keystone: resolves contradictions with confidence + provenance instead of guessing), True-Cost, Requirements/Packet, Profile-Match, Explainer, Need-Aware Flag
- **Monitors** — Policy-Monitor, Deadline, Outreach Customization, Outreach Outcome
- **Reward** — Solana Reward Agent

## Challenges we ran into

- **Restart-proof delivery.** Early on, a deadline reminder or a call outcome could only reach a student if the process remembered them from earlier in its own runtime — restart the process, lose the ability to proactively text anyone. Fixed by resolving a send-capable session directly from the student's stored platform identifier through Spectrum's own space-resolution API, instead of an in-memory map.
- **Silent data corruption.** The universities table was missing a uniqueness constraint, so a reseed could quietly duplicate a row. Caught by inspecting the data directly rather than trusting the seed script, merged the duplicates without losing real student history, and added the constraint so it can't recur.
- **Error isolation.** A single unreachable student or a single rejected send used to be able to cancel an entire batch of background outreach mid-run. Every background poller now processes its batch with per-record isolation.
- **The reconciliation problem itself.** Three independent gatherers — a scraped page, a phone call, an email reply — will genuinely disagree with each other about the same fact. The system has to decide what's actually true and say *why*, or the student ends up trusting a system that's no more reliable than the contradictory internet it replaced.

## Accomplishments we're proud of

A real devnet Solana transaction with a verifiable signature. A real iMessage conversation, driven end to end against a live Spectrum session, from "let's get started" through onboarding, the swipe deck, and an outreach customization reply. A live dashboard that streams every agent's real activity, token by token, instead of a static slide. And an honest list of real bugs we found and fixed rather than a system that's never been pushed hard enough to find any.

## What's next

A custom Anchor program to escrow and release the Solana reward per verified milestone (submitted → confirmed → enrolled) instead of a single transfer. Hypertables and continuous aggregates on the system's naturally time-series tables — `scholarship_fact_candidates` and `policy_change_log` are both append-heavy, timestamped streams that are a direct fit for TimescaleDB's native strengths, not just relational storage. A Twilio number import into ElevenLabs to take outbound calling fully live. And launching **rizzmytuition.biz** as a lighter, shareable front door for the audience this is actually built for, alongside the Scholafinder brand used with schools and counselors.

---

## Why Scholafinder wins Photon — Agents in iMessage

> *"Real human-in-the-loop collaboration, not a demo reel of prompts. Context-awareness that persists across time, channels, and teammates. A delightful default: the agent elevates the moment without demanding attention. Thoughtful safety and fallback behaviors that earn trust."*

| What Photon is judging | What Scholafinder delivers |
|---|---|
| **Vision** — does this push the frontier of hybrid intelligence? | The agent never acts on a student's behalf without them. Before a call or email goes out, the Outreach Customization Agent explicitly asks what they want asked and waits for an answer — a real pause for human judgment, not an autonomous action dressed up as collaboration. |
| **Craft** — is it cohesive, responsive, and tastefully integrated? | One identity flows across iMessage, the web swipe deck, and background monitoring, with a live token-streamed dashboard showing every agent's real activity as it happens — not a static architecture slide. |
| **Depth** — how well does it handle real-world context and edge cases? | Network interruptions, duplicate data, a bad wallet address, a Gemini timeout, an unreachable student mid-batch — each of these is a real condition this build hit and now handles gracefully (see Challenges, above), documented because it happened, not hypothetically listed. |
| **Traction** — can we imagine this running with real users tomorrow? | It already ran with a real phone number, over a real iMessage session, through onboarding, swiping, and outreach, end to end, before this submission was written. |

**On the Spectrum requirement specifically:** Scholafinder's entire interaction surface *is* Spectrum. The live inbound message loop, outbound sends, and the restart-proof session-resolution path all go through Photon's SDK — it's not a wrapper used for a single onboarding step with a generic chatbot everywhere else; every text the student ever receives from this system, proactive or reactive, travels through Spectrum.

## Why Scholafinder wins Solana

| Criterion | Honest answer |
|---|---|
| **Solana-native advantage** | The reward is a micro-incentive paid to potentially thousands of students for a real action (a completed application). That only works economically at sub-cent fees and near-instant finality — the right-sized problem for Solana, not a generic ledger entry that happens to run on it. |
| **Working demo** | Real, not promised: a live devnet transfer was sent and confirmed during this build, with a verifiable on-chain transaction signature. |
| **Technical complexity** | Today this is a native `SystemProgram` transfer via `@solana/web3.js`, deliberately scoped to devnet for safety — not yet a custom Anchor program. The honest next step is a program that escrows and releases the reward per verified milestone (submitted → confirmed → enrolled) instead of a single transfer, which is exactly the kind of on-chain state machine Anchor exists for. |
| **Design/UX** | A student never sees a wallet UI, never signs a transaction, never thinks about gas. They paste an address into iMessage, it's validated before anything is attempted, and a mistaken address gets a friendly re-prompt — crypto complexity stays entirely off the student's plate. |
| **Novelty** | AI agents, an international-education financial-access problem, and Solana payments rarely appear in the same sentence, let alone the same working system. |
| **Impact/usefulness** | Concrete user, concrete before/after: an international student who finishes a hard, intimidating application gets an immediate, verifiable token of recognition seconds later, at a cost to the platform of fractions of a cent even at scale. |
| **Presentation** | This table exists on purpose — it's the same one judges are using. |

We've also registered **rizzmytuition.biz** on GoDaddy as a lighter, more shareable front door for the student audience this is built for, sitting alongside the more formal Scholafinder brand used with schools and counselors.

## Why Scholafinder wins Fintech 🏆

> *"Rethink how money moves: payments, budgeting, investing, and the tools that make finances easier to manage."*

Financing a US education as an international student is one of the largest, least transparent financial decisions a family ever makes — routinely $200,000–$400,000 over four years, decided under a four-to-five-week email-reply cycle, in a second country's aid system, often in a second language.

- The **True-Cost Agent** computes the real number — sticker price minus the award, plus the international-only costs everyone forgets (health insurance, visa/SEVIS fees, flights) — before a family commits to a school on the strength of a headline "full tuition" that isn't actually "full ride."
- The **Requirements/Packet Agent** tells them exactly which financial forms a given school actually requires (CSS Profile, ISFAA) instead of leaving that discovery to a four-week email round trip.
- The **Explainer Agent** turns all of it into a plain-language card instead of a financial-aid PDF.
- The **Solana Reward Agent** is a working, real example of a near-zero-cost payment rail attached directly to a financial milestone.

This isn't a budgeting app bolted onto a chatbot. It's a system built specifically around the one financial decision it exists to de-risk.

**Why I'm the right person to build this:** I learned the Presidential Scholarship I eventually built this whole system around existed because a neighbor happened to mention it — not because any official channel told me. That's the entire problem, lived firsthand, not researched secondhand: the students who most need this information are the ones least likely to have someone in their life who already has it. I built the full stack myself — the agent orchestration, the database schema and reconciliation logic, the live iMessage integration, the real outbound calling and email pipeline, and the on-chain reward — because a financial-access problem this specific doesn't get solved by a frontend wrapped around someone else's API.

## Core MLH judging rubric

| Category | Weight | How Scholafinder addresses it |
|---|---|---|
| **Technology** | 25% | Fourteen independently invocable agents, a live iMessage transport via Spectrum, structured LLM calls with JSON-schema validation and retry logic via Vertex AI, a real relational schema with foreign keys and a confidence/provenance reconciliation layer, a webhook-verified inbound-email pipeline, and a confirmed on-chain Solana transaction. This is a live, functional backend end to end, not a static mockup wired to fixtures. |
| **Design & UX** | 25% | The entire primary interface is a text thread a student already knows how to use — zero onboarding friction, zero app install. The swipe deck mirrors a familiar Tinder-style interaction for the one step that benefits from a visual compare-and-choose moment. The live orchestration dashboard makes a fourteen-agent system legible to a non-technical judge at a glance, streaming real activity instead of asking them to trust a slide. |
| **Learning & Innovation** | 25% | This build pushed across a live messaging SDK (Spectrum/iMessage), a managed cloud Postgres service (Tiger Cloud), a voice-AI platform (ElevenLabs Conversational AI), an inbound-email webhook pipeline (Resend + Svix verification), and a blockchain SDK (Solana/web3.js) — five integration surfaces that were each new to this project, combined into one coordinated system rather than demoed in isolation. |
| **Impact & Viability** | 25% | The problem is specific, large, and personally verified: a four-to-five-week international admissions-office reply cycle, a $200k–$400k decision made with incomplete information, and a need-aware/need-blind distinction that quietly costs real students real admission odds. The system already ran, live, with a real student scenario end to end — this isn't a hypothetical "imagine if" pitch. |

## Why Scholafinder wins the Tiger Data track

```
+------------------------------------------------------------------------------------+
|                             TIGER DATA SCORING MATRIX                              |
+------------------------------------+-----------------------------------------------+
| Criteria                           | Weight / Focus                                |
+------------------------------------+-----------------------------------------------+
| Native Feature Utilization         | 35% (Hypertables, continuous aggregates, RAG) |
| Real-Time & Stream Ingestion       | 25% (High-throughput streams, live charts)    |
| Operational Relevance              | 20% (Solves a real data-heavy bottleneck)     |
| Architectural Justification & Demo | 20% (Query speedup, explain plan, live UI)    |
+------------------------------------+-----------------------------------------------+
```

Being straight about where this stands today: Scholafinder's schema is **thirteen relational tables with real foreign keys** — `students`, `preferences`, `universities`, `scholarship_fact_candidates`, `scholarship_facts`, `swipes`, `outreach_calls`, `outreach_emails`, `requirements_packets`, `true_cost`, `deadlines`, `policy_change_log`, and `rewards` — running on **Tiger Cloud Postgres**. It does not yet turn on a hypertable, a continuous aggregate, or pgvector, and we'd rather say that plainly than claim it.

What it *does* answer is the operational and architectural half of the rubric: this is a genuinely data-heavy bottleneck, not a toy CRUD app wearing a database for credit. `scholarship_fact_candidates` → `scholarship_facts` is a real multi-writer, single-reconciler pattern — every gatherer agent (Browser, Call, Email) writes a *candidate* row with its own confidence and source, and only the Reconciliation Agent is trusted to write the confirmed fact the rest of the system reads, with conflicting sources marked `conflicting` rather than silently resolved. `outreach_calls` and `outreach_emails` are append-only logs of real external interactions tied back to the student and the fact that triggered them. That's exactly the kind of multi-source, timestamped, trust-weighted data model that a flat Firebase document or a single SQLite file can't express cleanly — it needs real foreign keys and the kind of concurrent-write integrity a managed Postgres service gives for free.

And the honest next step is the specific, obvious one: `scholarship_fact_candidates` and `policy_change_log` are both append-heavy, naturally timestamped streams — one candidate fact per gatherer run, one drift-check per nightly re-crawl. Converting those two tables into hypertables and adding a continuous aggregate over `policy_change_log` (rolling "how often is this university's aid policy actually changing" per week) is the direct, native-TimescaleDB answer to "why Tiger Data and not SQLite" for this specific system — and it's the first thing we'd ship with another week.

## Best Use of Gemini API

Every piece of reasoning in Scholafinder — not just one feature — runs through Gemini via Vertex AI on Google Cloud, funneled through a single choke point (`src/llm.ts`) with two disciplined entry points: schema-constrained JSON extraction (used by every gatherer and resolver agent, so a fact extracted from a scraped page or a call transcript comes back as validated structured data, not free text to parse again) and token-streamed prose generation (used for the Explainer Agent's cards and the boss agent's own conversational replies, visible live, streaming, in the orchestration dashboard). Both paths retry automatically on transient failures (503/429/`UNAVAILABLE`/`RESOURCE_EXHAUSTED`) rather than failing a student-facing interaction on a blip. This is inference on Gemini at the center of the system's actual decision-making, not a single bolted-on chatbot call.

## Best Use of ElevenLabs

The Call Gatherer agent places outbound calls to university admissions offices using ElevenLabs Conversational AI, asking the specific questions the student chose over iMessage rather than a generic script — the student is consulted before the agent calls on their behalf, and the questions asked are theirs. ElevenLabs' Text-to-Speech is also used for a recorded two-voice demo of that exact call flow, so the interaction is inspectable even in a setting (like a judging room) where placing a live outbound call isn't practical.

## Best Domain Name from GoDaddy Registry

We registered **rizzmytuition.biz** on GoDaddy — deliberately a second, lighter brand sitting alongside the more formal Scholafinder name. Scholafinder is the name used with schools, counselors, and this submission; `rizzmytuition.biz` is the name meant to actually spread among the students it's for, in the register they'd use with each other.

---

*Built end to end for this hackathon: the agent orchestration, the database schema and reconciliation logic, the live iMessage integration, the outbound calling and email pipeline, the web swipe deck and orchestration dashboard, and the on-chain reward.*
