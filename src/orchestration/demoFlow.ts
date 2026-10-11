/**
 * "Run Demo Flow" — fires a real end-to-end pass through every agent in the roster against
 * real data (one university, the real demo student), so the live orchestration view can show
 * all 11 subagents + the boss lighting up without needing to wait for an organic iMessage/swipe
 * event. Nothing here is faked or scripted output — every call is the actual production agent
 * function hitting the actual Tiger Data database (and, for the browser agent, a real live page).
 */
import { pool } from "../db/pool.js";
import { runAgent } from "./bus.js";
import { tenantLabelFor } from "./tenant.js";
import { scrapeUniversityAidPage } from "../agents/browserAgent.js";
import { reconcileFact } from "../agents/reconciliationAgent.js";
import { computeTrueCost } from "../agents/trueCostAgent.js";
import { buildRequirementsPacket } from "../agents/requirementsAgent.js";
import { explainScholarship } from "../agents/explainerAgent.js";
import { simulateAdmissionsCall } from "../agents/callSimulatorAgent.js";
import { draftAndSendEmail } from "../agents/emailAgent.js";
import { recheckFact } from "../agents/policyMonitorAgent.js";
import { checkAndNotifyDeadlines } from "../agents/deadlineAgent.js";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { needAwareWarning } from "../agents/needAwareAgent.js";
import { fetchPageText } from "../agents/pageFetch.js";

const DEMO_QUESTIONS = [
  "Are international students eligible for need-based financial aid?",
  "What does the application process look like for international applicants?",
  "When are admission and aid decisions released?",
];

export async function runDemoFlow(studentId: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; name: string; aid_site_url: string; admissions_email: string }>(
    `SELECT id, name, aid_site_url, admissions_email FROM universities ORDER BY random() LIMIT 1`
  );
  const uni = rows[0];
  if (!uni) return;

  const tenantLabel = await tenantLabelFor(studentId);
  const t = { tenant: studentId, tenantLabel };

  await runAgent("browser", "Scrape live aid page", uni.name, () => scrapeUniversityAidPage(uni.id, uni.aid_site_url), (e) => `international_eligible=${e.international_eligible}`, {
    ...t,
    dispatchSource: [{ kind: "db", label: "universities.aid_site_url" }],
    resultSource: () => [{ kind: "url", label: uni.aid_site_url }],
  });

  await runAgent("reconciliation", "Reconcile international_eligible", uni.name, () => reconcileFact(uni.id, "international_eligible"), () => "fact reconciled with provenance", {
    ...t,
    dispatchSource: [{ kind: "db", label: "scholarship_fact_candidates WHERE university_id=…" }],
    resultSource: () => [{ kind: "db", label: "scholarship_facts table (confidence + provenance written)" }],
  });

  await runAgent("profilematch", "Rank swipe stack", `student ${studentId}`, () => rankUniversitiesForStudent(studentId), (r) => `${r.length} ranked`, {
    ...t,
    dispatchSource: [{ kind: "db", label: "preferences WHERE student_id=…" }],
    resultSource: () => [{ kind: "db", label: "preferences, universities, swipes tables" }],
  });

  await runAgent("truecost", "Compute true cost", uni.name, () => computeTrueCost(studentId, uni.id), (n) => `net cost $${n}`, {
    ...t,
    dispatchSource: [{ kind: "db", label: "scholarship_facts (cost_of_attendance_usd, award_usd)" }],
    resultSource: () => [{ kind: "db", label: "true_cost table (Tiger Data)" }],
  });

  await runAgent(
    "requirements",
    "Build requirements packet",
    uni.name,
    async () => buildRequirementsPacket(uni.id, await fetchPageText(uni.aid_site_url)),
    (p) => `test_policy=${p.test_policy}`,
    {
      ...t,
      dispatchSource: [{ kind: "url", label: uni.aid_site_url }],
      resultSource: () => [{ kind: "db", label: "requirements_packets table" }],
    }
  );

  await runAgent("needaware", "Check need-aware flag", uni.name, () => needAwareWarning(uni.id), (w) => (w ? "flagged" : "no flag needed"), {
    ...t,
    dispatchSource: [{ kind: "db", label: "scholarship_facts WHERE fact_key='need_aware'" }],
    resultSource: () => [{ kind: "db", label: "scholarship_facts table" }],
  });

  await runAgent("explainer", "Write explainer card", uni.name, (dispatchId) => explainScholarship(studentId, uni.id, dispatchId, studentId, tenantLabel), (c) => c.slice(0, 100), {
    ...t,
    dispatchSource: [{ kind: "db", label: "scholarship_facts, requirements_packets, true_cost" }],
    resultSource: () => [{ kind: "gcp", label: "Vertex AI (gemini-2.5-flash) — grounded in Tiger Data rows above" }],
  });

  const { rows: callRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_calls (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, uni.id, DEMO_QUESTIONS]
  );
  await runAgent("call", "Call admissions (simulated)", uni.name, (dispatchId) => simulateAdmissionsCall(callRows[0].id, uni.id, DEMO_QUESTIONS, dispatchId, studentId, tenantLabel), () => "call transcript logged", {
    ...t,
    externalParty: `${uni.name} Admissions`,
    dispatchSource: [{ kind: "db", label: "universities.admissions_phone" }],
    resultSource: () => [
      { kind: "db", label: "scholarship_facts WHERE university_id=… (grounds the simulated transcript)" },
      { kind: "api", label: "ElevenLabs TTS + Vertex AI — labeled SIMULATED in outreach_calls.transcript" },
    ],
  });

  if (uni.admissions_email && process.env.RESEND_API_KEY) {
    const { rows: emailRows } = await pool.query<{ id: string }>(
      `INSERT INTO outreach_emails (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
      [studentId, uni.id, DEMO_QUESTIONS]
    );
    await runAgent(
      "email",
      "Draft + send admissions email",
      uni.name,
      (dispatchId) => draftAndSendEmail(emailRows[0].id, uni.admissions_email, uni.name, DEMO_QUESTIONS, dispatchId, studentId, tenantLabel),
      () => "sent",
      {
      ...t,
      externalParty: `${uni.name} Admissions`,
      dispatchSource: [{ kind: "db", label: "universities.admissions_email" }],
      resultSource: () => [{ kind: "api", label: "Resend API — outreach_emails.sent_body" }],
    });
  }

  await runAgent("policymonitor", "Recheck fact for drift", uni.name, () => recheckFact(uni.id, "international_eligible"), (r) => r.note, {
    ...t,
    dispatchSource: [{ kind: "db", label: "scholarship_facts WHERE status='confirmed'" }],
    resultSource: () => [{ kind: "url", label: "re-scraped aid_site_url, diffed against stored fact" }],
  });

  await runAgent("deadline", "Check upcoming deadlines", "all students", () => checkAndNotifyDeadlines(), (n) => `${n} reminder(s) sent`, {
    ...t,
    dispatchSource: [{ kind: "db", label: "deadlines table (reminded_at IS NULL, due <=14d)" }],
    resultSource: () => [{ kind: "db", label: "deadlines table (Tiger Data)" }],
  });
}
