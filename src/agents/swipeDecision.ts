/**
 * Shared "record a swipe decision" core, used by both the boss agent (iMessage) and the
 * web swipe deck (drag gestures). On yes: saves the swipe, computes true cost, generates the
 * explainer card. It deliberately does NOT kick off call/email outreach here anymore — that
 * now waits on the call-question customization step (src/agents/outreachCustomization.ts),
 * which asks the student what they want asked before dialing/emailing.
 */
import { pool } from "../db/pool.js";
import { computeTrueCost } from "./trueCostAgent.js";
import { explainScholarship } from "./explainerAgent.js";
import { runAgent, type NodeId } from "../orchestration/bus.js";
import { tenantLabelFor } from "../orchestration/tenant.js";

export type SwipeDecision = "yes" | "no" | "skip";

export async function recordSwipe(studentId: string, universityId: string, decision: SwipeDecision): Promise<{ card?: string | null }> {
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
    // streamText (src/llm.ts) already retries transient failures once before this throws, so
    // this is the genuine-failure path. The swipe card itself already shows the real structured
    // facts (deadline, tuition, aid type — see cardDetails in src/boss/swipe.ts) the student just
    // looked at, so there's nothing honest left to say in a placeholder narrative — skip the
    // reveal/iMessage card rather than show an apology box with no new information in it.
    console.error("[explainerAgent] failed:", err.message);
    return null;
  });

  // Persisted so swipeNotifier (polling, since the web deck and the boss agent are separate
  // processes/deployments) can text this card over iMessage once a space exists — but only if
  // the explainer actually produced one (see the catch above). Outreach (call/email) is NOT
  // kicked off here — outreachCustomization.ts's poller picks up this yes-swipe next tick and
  // asks the student what they want asked first.
  if (card) {
    await pool.query(`UPDATE swipes SET card_text = $1 WHERE student_id = $2 AND university_id = $3`, [card, studentId, universityId]);
  }

  return { card };
}
