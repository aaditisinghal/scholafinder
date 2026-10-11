/**
 * Shared "record a swipe decision" core, used by both the boss agent (iMessage) and the
 * web swipe deck (drag gestures). On yes: saves the swipe, computes true cost, generates
 * the explainer card, and kicks off call + email outreach with default questions — the web
 * deck has no per-school customization step, that's covered by iMessage follow-up only if
 * the student asks for it directly.
 */
import { pool } from "../db/pool.js";
import { computeTrueCost } from "./trueCostAgent.js";
import { explainScholarship } from "./explainerAgent.js";
import { placeAdmissionsCall } from "./callAgent.js";
import { simulateAdmissionsCall } from "./callSimulatorAgent.js";
import { draftAndSendEmail } from "./emailAgent.js";
import { runAgent, type NodeId } from "../orchestration/bus.js";
import { tenantLabelFor } from "../orchestration/tenant.js";

export type SwipeDecision = "yes" | "no" | "skip";

const DEFAULT_QUESTIONS = [
  "Are international students eligible for need-based financial aid?",
  "What does the application process look like for international applicants?",
  "When are admission and aid decisions released?",
];

export async function recordSwipe(studentId: string, universityId: string, decision: SwipeDecision): Promise<{ card?: string }> {
  await pool.query(
    `INSERT INTO swipes (student_id, university_id, decision) VALUES ($1,$2,$3)
     ON CONFLICT (student_id, university_id) DO UPDATE SET decision = $3`,
    [studentId, universityId, decision]
  );

  if (decision !== "yes") return {};

  const origin: NodeId = "web";
  const tenantLabel = await tenantLabelFor(studentId);

  await runAgent("truecost", "Compute true cost", `student ${studentId} × university ${universityId}`, () => computeTrueCost(studentId, universityId), (net) => `net cost $${net}`, {
    from: origin,
    tenant: studentId,
    tenantLabel,
    dispatchSource: [{ kind: "db", label: "scholarship_facts (cost_of_attendance_usd, award_usd)" }],
    resultSource: () => [{ kind: "db", label: "true_cost table (Tiger Data)" }],
  }).catch((err) => console.error("[trueCostAgent] failed:", err.message));

  const card = await runAgent(
    "explainer",
    "Write swipe-yes explainer card",
    `student ${studentId} × university ${universityId}`,
    (dispatchId) => explainScholarship(studentId, universityId, dispatchId, studentId, tenantLabel),
    (c) => c.slice(0, 120),
    {
      from: origin,
      tenant: studentId,
      tenantLabel,
      dispatchSource: [{ kind: "db", label: "scholarship_facts, requirements_packets, true_cost" }],
      resultSource: () => [{ kind: "gcp", label: "Vertex AI (gemini-2.5-flash) — grounded in Tiger Data rows above" }],
    }
  ).catch((err) => {
    console.error("[explainerAgent] failed:", err.message);
    return "Saved — I don't have full details yet, but I'll keep researching.";
  });

  // Persisted so swipeNotifier (polling, since the web deck and the boss agent are
  // separate processes/deployments) can text this card over iMessage once a space exists.
  await pool.query(`UPDATE swipes SET card_text = $1 WHERE student_id = $2 AND university_id = $3`, [card, studentId, universityId]);

  kickOffOutreach(studentId, tenantLabel, universityId, origin).catch((err) => console.error("[swipeDecision] outreach failed:", err.message));

  return { card };
}

async function kickOffOutreach(studentId: string, tenantLabel: string, universityId: string, origin: NodeId): Promise<void> {
  const { rows: uniRows } = await pool.query(
    `SELECT name, admissions_phone, admissions_email FROM universities WHERE id = $1`,
    [universityId]
  );
  const uni = uniRows[0];
  if (!uni) return;

  const { rows: callRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_calls (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, DEFAULT_QUESTIONS]
  );
  const { rows: emailRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_emails (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, DEFAULT_QUESTIONS]
  );

  if (uni.admissions_phone) {
    // No Twilio number is imported into ElevenLabs yet, and real admissions offices don't
    // answer on weekends/after hours anyway — simulate the call until ELEVENLABS_AGENT_PHONE_NUMBER_ID
    // is actually configured, then this automatically switches to the real one.
    const live = Boolean(process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID);
    runAgent(
      "call",
      live ? "Call admissions (live)" : "Call admissions (simulated)",
      uni.name,
      async (dispatchId) => {
        if (live) {
          await placeAdmissionsCall(callRows[0].id, uni.admissions_phone, uni.name, DEFAULT_QUESTIONS);
        } else {
          await simulateAdmissionsCall(callRows[0].id, universityId, DEFAULT_QUESTIONS, dispatchId, studentId, tenantLabel);
        }
      },
      () => `call with ${uni.name} admissions logged`,
      {
        from: origin,
        tenant: studentId,
        tenantLabel,
        externalParty: `${uni.name} Admissions`,
        dispatchSource: [{ kind: "db", label: "universities.admissions_phone" }],
        resultSource: () =>
          live
            ? [{ kind: "api", label: "ElevenLabs Conversational AI + Twilio (live call)" }]
            : [
                { kind: "db", label: "scholarship_facts WHERE university_id=… (grounds the simulated transcript)" },
                { kind: "api", label: "ElevenLabs TTS (officer voice) + Vertex AI (transcript) — labeled SIMULATED in outreach_calls.transcript" },
              ],
      }
    ).catch((err) => console.error("[callAgent] failed:", err.message));
  }
  if (uni.admissions_email) {
    runAgent(
      "email",
      "Draft + send admissions email",
      uni.name,
      (dispatchId) => draftAndSendEmail(emailRows[0].id, uni.admissions_email, uni.name, DEFAULT_QUESTIONS, dispatchId, studentId, tenantLabel),
      () => `sent to ${uni.admissions_email}`,
      {
      from: origin,
      tenant: studentId,
      tenantLabel,
      externalParty: `${uni.name} Admissions`,
      dispatchSource: [{ kind: "db", label: "universities.admissions_email" }],
      resultSource: () => [{ kind: "api", label: "Resend API — outreach_emails.sent_body" }],
    }).catch((err) => console.error("[emailAgent] failed:", err.message));
  }
}
