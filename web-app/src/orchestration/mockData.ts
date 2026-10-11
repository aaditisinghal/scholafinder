/**
 * Hardcoded placeholder activity — fills every box with plausible history (and a couple of
 * "running" boxes for the glow effect) so the full design is visible without needing a live
 * demo run first. All timestamps are deliberately old: any real event (always newer) wins in
 * deriveAgentStates' newest-first scan, so this disappears the moment real activity happens.
 *
 * NOT real data — don't present this as live activity to anyone judging the actual system.
 */
import type { OrchestrationEvent } from "./types";

const now = Date.now();
const minAgo = (m: number) => now - m * 60_000;

let seq = 0;
function pair(
  agent: OrchestrationEvent["agent"],
  label: string,
  dispatchSummary: string,
  resultSummary: string,
  source: OrchestrationEvent["source"],
  minutesAgo: number,
  durationMs: number,
  tenant: string,
  tenantLabel: string,
  from: OrchestrationEvent["from"] = "boss",
  externalParty?: string
): OrchestrationEvent[] {
  const ts = minAgo(minutesAgo);
  const dispatchId = `mock-dispatch-${seq++}`;
  return [
    { id: `mock-${seq++}`, ts, kind: "dispatch", from, to: agent, agent, label, summary: dispatchSummary, status: "success", tenant, tenantLabel, source: [], externalParty },
    {
      id: dispatchId,
      ts: ts + durationMs,
      kind: "result",
      from: agent,
      to: from,
      agent,
      label,
      summary: resultSummary,
      status: "success",
      durationMs,
      dispatchId,
      tenant,
      tenantLabel,
      source,
      externalParty,
    },
  ];
}

function running(
  agent: OrchestrationEvent["agent"],
  label: string,
  summary: string,
  tenant: string,
  tenantLabel: string,
  from: OrchestrationEvent["from"] = "boss",
  externalParty?: string
): OrchestrationEvent {
  return { id: `mock-running-${seq++}`, ts: minAgo(0.05), kind: "dispatch", from, to: agent, agent, label, summary, status: "running", tenant, tenantLabel, source: [], externalParty };
}

const S1 = "+14049102619";
const S1L = "+14049102619";
const S2 = "demo-student";
const S2L = "demo-student";

export const MOCK_EVENTS: OrchestrationEvent[] = [
  ...pair("browser", "Scrape live aid page", "Florida State University", "international_eligible=yes", [{ kind: "url", label: "https://financialaid.fsu.edu" }], 18, 6200, S1, S1L),
  ...pair("browser", "Scrape live aid page", "MIT", "international_eligible=yes", [{ kind: "url", label: "https://sfs.mit.edu" }], 34, 5400, S2, S2L),

  ...pair("reconciliation", "Reconcile international_eligible", "Florida State University", "fact reconciled with provenance", [{ kind: "db", label: "scholarship_facts table (confidence + provenance written)" }], 18, 1800, S1, S1L),
  ...pair("reconciliation", "Reconcile need_aware", "MIT", "fact reconciled — all sources agree", [{ kind: "db", label: "scholarship_facts table" }], 33, 900, S2, S2L),

  ...pair("truecost", "Compute true cost", "Florida State University", "net cost $4610", [{ kind: "db", label: "true_cost table (Tiger Data)" }], 17, 690, S1, S1L),
  ...pair("truecost", "Compute true cost", "Amherst College", "net cost $4610", [{ kind: "db", label: "true_cost table (Tiger Data)" }], 29, 650, S2, S2L),

  ...pair("requirements", "Build requirements packet", "Florida State University", "test_policy=optional", [{ kind: "url", label: "https://financialaid.fsu.edu" }], 17, 1620, S1, S1L),
  ...pair("requirements", "Build requirements packet", "MIT", "test_policy=required", [{ kind: "url", label: "https://sfs.mit.edu" }], 32, 1410, S2, S2L),

  ...pair("profilematch", "Rank swipe stack", "student " + S1, "9 ranked", [{ kind: "db", label: "preferences, universities, swipes tables" }], 19, 310, S1, S1L),
  ...pair("profilematch", "Rank swipe stack", "student " + S2, "12 ranked", [{ kind: "db", label: "preferences, universities, swipes tables" }], 35, 290, S2, S2L),

  ...pair(
    "explainer",
    "Write swipe-yes explainer card",
    "Florida State University",
    "Florida State offers need-based aid for international students, need-aware. Net cost $4,610 after aid.",
    [{ kind: "gcp", label: "Vertex AI (gemini-2.5-flash) — grounded in Tiger Data rows above" }],
    16,
    1070,
    S1,
    S1L
  ),
  ...pair(
    "explainer",
    "Write swipe-yes explainer card",
    "Amherst College",
    "Amherst meets full demonstrated need for international students, need-blind. Net cost $4,610.",
    [{ kind: "gcp", label: "Vertex AI (gemini-2.5-flash) — grounded in Tiger Data rows above" }],
    28,
    980,
    S2,
    S2L
  ),

  ...pair("needaware", "Check need-aware flag", "Florida State University", "flagged", [{ kind: "db", label: "scholarship_facts table" }], 16, 40, S1, S1L),
  ...pair("needaware", "Check need-aware flag", "Amherst College", "no flag needed", [{ kind: "db", label: "scholarship_facts table" }], 27, 35, S2, S2L),

  ...pair(
    "call",
    "Call admissions (simulated)",
    "Florida State University",
    "call with Florida State University admissions logged",
    [
      { kind: "db", label: "scholarship_facts WHERE university_id=… (grounds the simulated transcript)" },
      { kind: "api", label: "ElevenLabs TTS + Vertex AI — labeled SIMULATED in outreach_calls.transcript" },
    ],
    15,
    4412,
    S1,
    S1L,
    "web",
    "Florida State University Admissions"
  ),
  ...pair(
    "call",
    "Call admissions (simulated)",
    "University of Rochester",
    "call with University of Rochester admissions logged",
    [
      { kind: "db", label: "scholarship_facts WHERE university_id=… (grounds the simulated transcript)" },
      { kind: "api", label: "ElevenLabs TTS + Vertex AI — labeled SIMULATED in outreach_calls.transcript" },
    ],
    26,
    3981,
    S2,
    S2L,
    "web",
    "University of Rochester Admissions"
  ),

  ...pair(
    "email",
    "Draft + send admissions email",
    "Florida State University",
    "sent to financialaid@fsu.edu",
    [{ kind: "api", label: "Resend API — outreach_emails.sent_body" }],
    15,
    820,
    S1,
    S1L,
    "web",
    "Florida State University Admissions"
  ),
  ...pair(
    "email",
    "Draft + send admissions email",
    "Mount Holyoke College",
    "sent to admission@mtholyoke.edu",
    [{ kind: "api", label: "Resend API — outreach_emails.sent_body" }],
    24,
    760,
    S2,
    S2L,
    "web",
    "Mount Holyoke College Admissions"
  ),

  ...pair("policymonitor", "Recheck fact for drift", "Florida State University", "Unchanged on recheck.", [{ kind: "url", label: "re-scraped aid_site_url, diffed against stored fact" }], 10, 1911, S1, S1L),
  ...pair("policymonitor", "Recheck fact for drift", "Georgetown University", "Unchanged on recheck.", [{ kind: "url", label: "re-scraped aid_site_url, diffed against stored fact" }], 22, 2103, S2, S2L),

  ...pair("deadline", "Check upcoming deadlines", "all students", "1 reminder(s) sent", [{ kind: "db", label: "deadlines table (Tiger Data)" }], 5, 29, "system", "system"),
  ...pair("deadline", "Check upcoming deadlines", "all students", "0 reminder(s) sent", [{ kind: "db", label: "deadlines table (Tiger Data)" }], 15, 27, "system", "system"),

  ...pair("reward", "Send devnet SOL reward", "Amherst College · HFpVxfF7…", "tx 5e826ab2ab6c…", [{ kind: "api", label: "Solana devnet RPC — on-chain tx" }], 3, 2200, S2, S2L),

  // boss "runs" are the per-message onboarding/swipe-stack dispatches it issues to itself
  ...pair("boss", "Rank swipe stack", "student " + S1, "9 universities ranked", [{ kind: "db", label: "preferences, universities, swipes tables" }], 19, 310, S1, S1L, "web"),
  ...pair("boss", "Send devnet SOL reward", "Amherst College", "tx 5e826ab2ab6c…", [{ kind: "api", label: "Solana devnet RPC" }], 3, 2200, S2, S2L, "web"),
  ...pair("boss", "iMessage reply", "student " + S1, "Got it. Found 9 universities worth your time…", [{ kind: "api", label: "Spectrum (Photon) iMessage" }], 19, 80, S1, S1L, "imessage"),

  // one agent left visibly "running" per group, for the glow effect, purely cosmetic
  running("browser", "Scrape live aid page", "University of Chicago", S2, S2L),
  running("requirements", "Build requirements packet", "Georgetown University", S1, S1L),
];

export interface MockMessage {
  from: "student" | "boss";
  text: string;
  minutesAgo: number;
}

export const MOCK_IMESSAGE_CONVERSATION: MockMessage[] = [
  { from: "student", text: "let's get started", minutesAgo: 20 },
  { from: "boss", text: "Hey — I'm Scholafinder. I'll find US universities that actually take international students and actually fund them, then handle the research and outreach for you.\n\nA few quick questions first.\n\nWhat kind of campus culture are you after — startup, corporate, liberal arts, research-heavy, or arts-focused?", minutesAgo: 20 },
  { from: "student", text: "startup culture for sure, somewhere urban", minutesAgo: 19 },
  { from: "boss", text: "Urban, suburban, or rural setting?", minutesAgo: 19 },
  { from: "student", text: "urban", minutesAgo: 19 },
  { from: "boss", text: "What aid are you looking for — full ride, full tuition only, partial, or you're open to anything?", minutesAgo: 19 },
  { from: "student", text: "need full ride honestly, international student here", minutesAgo: 18 },
  { from: "boss", text: "Got it. Found 9 universities worth your time. Swipe through them here: localhost:3000/swipe/9fe9aa46…\n\nSwipe right on the ones you want — I'll start researching deeper and calling/emailing admissions the moment you do.", minutesAgo: 18 },
  { from: "student", text: "submitted Florida State University", minutesAgo: 3 },
  { from: "boss", text: "🎉 Congrats on submitting to Florida State University! Drop a Solana devnet wallet address and I'll send a small token reward.", minutesAgo: 3 },
  { from: "student", text: "HFpVxfF7RYMCop2DUiBGyvUeG1bhc7EkQHSJUxZxm9LK", minutesAgo: 3 },
  { from: "boss", text: "💸 Sent — devnet tx: 5e826ab2ab6c…", minutesAgo: 2 },
];
