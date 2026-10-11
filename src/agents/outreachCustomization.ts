/**
 * "Anything specific you want me to ask?" — the customization step the original pitch promised
 * and the code never built. On a yes-swipe, outreach no longer fires immediately with default
 * questions: this module asks the student first, waits (bounded by a timeout), and only then
 * calls kickOffOutreach with whatever was decided.
 *
 * Routed entirely through the DB + poll bridge already established by swipeNotifier.ts, rather
 * than trying to send synchronously from the Vercel-deployed /api/swipe handler (src/web/server.ts)
 * — that process has no Spectrum credentials today, and duplicating send capability there just to
 * shave a poll interval off this one prompt isn't worth a second way of doing what the poller
 * pattern already solves reliably.
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";
import { composeMessage } from "../boss/voice.js";
import { askForJson, Type } from "../llm.js";
import { placeAdmissionsCall } from "./callAgent.js";
import { simulateAdmissionsCall } from "./callSimulatorAgent.js";
import { draftAndSendEmail } from "./emailAgent.js";
import { runAgent, type NodeId } from "../orchestration/bus.js";
import { tenantLabelFor } from "../orchestration/tenant.js";

export const DEFAULT_QUESTIONS = [
  "Are international students eligible for need-based financial aid?",
  "What does the application process look like for international applicants?",
  "When are admission and aid decisions released?",
];

const CUSTOMIZATION_TIMEOUT_MINUTES = 10;

interface PendingRow {
  id: string;
  student_id: string;
  university_id: string;
  university_name: string;
}

/** For a student with no swipe currently awaiting a reply, ask about their oldest un-prompted yes-swipe. */
export async function askPendingCustomization(): Promise<number> {
  const { rows } = await pool.query<PendingRow>(
    `SELECT DISTINCT ON (s.student_id) s.id, s.student_id, s.university_id, u.name AS university_name
     FROM swipes s
     JOIN universities u ON u.id = s.university_id
     WHERE s.decision = 'yes'
       AND s.customization_prompted_at IS NULL
       AND s.custom_call_questions IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM swipes awaiting
         WHERE awaiting.student_id = s.student_id
           AND awaiting.customization_prompted_at IS NOT NULL
           AND awaiting.custom_call_questions IS NULL
       )
     ORDER BY s.student_id, s.decided_at ASC`
  );

  let sent = 0;
  for (const row of rows) {
    try {
      const space = await getSpace(row.student_id);
      if (!space) continue; // retry next tick once a space can be resolved
      const text = await composeMessage(
        "Ask the student if there's anything specific they want asked when reaching out to this university's admissions office — give one or two concrete examples (a named scholarship, a program, an interview question) so they know what kind of answer is useful. Make clear they can just say 'go ahead' to use your usual questions instead.",
        { universityName: row.university_name, usualQuestions: DEFAULT_QUESTIONS }
      );
      await space.send(text);
      await pool.query(`UPDATE swipes SET customization_prompted_at = now() WHERE id = $1`, [row.id]);
      sent++;
    } catch (err) {
      // One student's unreachable/invalid target must not stop the rest of this tick's batch.
      console.error(`[outreachCustomization] couldn't ask ${row.id} (${row.university_name}):`, (err as Error).message);
    }
  }
  return sent;
}

/** After the timeout, any swipe still waiting on a reply proceeds with the default questions. */
export async function resolveTimedOutCustomizations(): Promise<number> {
  const { rows } = await pool.query<PendingRow>(
    `SELECT s.id, s.student_id, s.university_id, u.name AS university_name
     FROM swipes s
     JOIN universities u ON u.id = s.university_id
     WHERE s.decision = 'yes'
       AND s.customization_prompted_at IS NOT NULL
       AND s.custom_call_questions IS NULL
       AND s.customization_prompted_at < now() - ($1 || ' minutes')::interval`,
    [CUSTOMIZATION_TIMEOUT_MINUTES]
  );

  let resolved = 0;
  for (const row of rows) {
    try {
      await resolve(row, DEFAULT_QUESTIONS, true);
      resolved++;
    } catch (err) {
      console.error(`[outreachCustomization] couldn't resolve timeout for ${row.id} (${row.university_name}):`, (err as Error).message);
    }
  }
  return resolved;
}

/** Does this student currently have a swipe awaiting their answer (within the timeout window)? */
export async function pendingCustomizationFor(studentId: string): Promise<PendingRow | null> {
  const { rows } = await pool.query<PendingRow>(
    `SELECT s.id, s.student_id, s.university_id, u.name AS university_name
     FROM swipes s
     JOIN universities u ON u.id = s.university_id
     WHERE s.student_id = $1
       AND s.decision = 'yes'
       AND s.customization_prompted_at IS NOT NULL
       AND s.custom_call_questions IS NULL
       AND s.customization_prompted_at >= now() - ($2 || ' minutes')::interval
     ORDER BY s.customization_prompted_at ASC
     LIMIT 1`,
    [studentId, CUSTOMIZATION_TIMEOUT_MINUTES]
  );
  return rows[0] ?? null;
}

/** Called from the boss's message handler when a student replies while a prompt is pending. */
export async function resolveCustomizationReply(row: PendingRow, replyText: string): Promise<void> {
  const parsed = await askForJson<{ useDefaults: boolean; questions: string[] | null }>({
    system: `The student was asked if they want anything specific asked when their university's admissions office is contacted. Decide: did they want to use the usual default questions (useDefaults=true, e.g. "go ahead", "nope", "use your questions"), or did they give specific questions/topics to ask about (useDefaults=false, questions=the list, rewritten as clear standalone questions)?`,
    prompt: replyText,
    maxTokens: 200,
    schema: {
      type: Type.OBJECT,
      properties: {
        useDefaults: { type: Type.BOOLEAN },
        questions: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
      },
      required: ["useDefaults", "questions"],
    },
  });

  const questions = !parsed.useDefaults && parsed.questions && parsed.questions.length > 0 ? parsed.questions : DEFAULT_QUESTIONS;
  await resolve(row, questions, false);
}

async function resolve(row: PendingRow, questions: string[], timedOut: boolean): Promise<void> {
  await pool.query(`UPDATE swipes SET custom_call_questions = $1 WHERE id = $2`, [questions, row.id]);

  // The confirmation text is a courtesy, not the point — an unreachable/rejected target must
  // not stop the actual outreach (the line below) from firing. Previously this threw out of
  // `resolve` on a send failure, silently skipping kickOffOutreach while still marking the row
  // "resolved" (custom_call_questions already written above), so it would never be retried.
  try {
    const space = await getSpace(row.student_id);
    if (space) {
      const text = await composeMessage(
        timedOut
          ? "Tell the student you didn't hear back in time, so you're going ahead with your usual questions for this university."
          : "Confirm you're reaching out to this university now with the questions they gave you (or their usual ones) — keep it brief, you'll let them know what you hear back.",
        { universityName: row.university_name, questions }
      );
      await space.send(text);
    }
  } catch (err) {
    console.error(`[outreachCustomization] confirmation send failed for ${row.id} (${row.university_name}), proceeding with outreach anyway:`, (err as Error).message);
  }

  await kickOffOutreach(row.student_id, row.university_id, questions, "imessage");
}

async function kickOffOutreach(studentId: string, universityId: string, questions: string[], origin: NodeId): Promise<void> {
  const tenantLabel = await tenantLabelFor(studentId);
  const { rows: uniRows } = await pool.query(
    `SELECT name, admissions_phone, admissions_email FROM universities WHERE id = $1`,
    [universityId]
  );
  const uni = uniRows[0];
  if (!uni) return;

  const { rows: callRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_calls (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, questions]
  );
  const { rows: emailRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_emails (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, questions]
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
          await placeAdmissionsCall(callRows[0].id, uni.admissions_phone, uni.name, questions);
        } else {
          await simulateAdmissionsCall(callRows[0].id, universityId, questions, dispatchId, studentId, tenantLabel);
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
      (dispatchId) => draftAndSendEmail(emailRows[0].id, uni.admissions_email, uni.name, questions, dispatchId, studentId, tenantLabel),
      () => `sent to ${uni.admissions_email}`,
      {
        from: origin,
        tenant: studentId,
        tenantLabel,
        externalParty: `${uni.name} Admissions`,
        dispatchSource: [{ kind: "db", label: "universities.admissions_email" }],
        resultSource: () => [{ kind: "api", label: "Resend API — outreach_emails.sent_body" }],
      }
    ).catch((err) => console.error("[emailAgent] failed:", err.message));
  }
}
