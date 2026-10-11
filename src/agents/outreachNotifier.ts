/**
 * "Here's what happened with your call/email" — the half of outreach that used to go silent
 * after dispatch. Polls outreach_calls/outreach_emails for a completed/replied row with a
 * summary that hasn't been texted yet, and sends it the moment a space can be resolved.
 * Pattern-matched to swipeNotifier.ts.
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";
import { composeMessage } from "../boss/voice.js";

interface OutcomeRow {
  id: string;
  student_id: string;
  university_name: string;
  summary: string;
  kind: "call" | "email";
}

export async function notifyPendingOutreachOutcomes(): Promise<number> {
  const { rows } = await pool.query<OutcomeRow>(
    `SELECT c.id, c.student_id, u.name AS university_name, c.summary, 'call' AS kind
     FROM outreach_calls c
     JOIN universities u ON u.id = c.university_id
     WHERE c.status = 'completed' AND c.summary IS NOT NULL AND c.notified_at IS NULL
     UNION ALL
     SELECT e.id, e.student_id, u.name AS university_name, e.summary, 'email' AS kind
     FROM outreach_emails e
     JOIN universities u ON u.id = e.university_id
     WHERE e.status = 'replied' AND e.summary IS NOT NULL AND e.notified_at IS NULL`
  );

  let sent = 0;
  for (const row of rows) {
    try {
      const space = await getSpace(row.student_id);
      if (!space) continue; // retry next tick once a space can be resolved

      const text = await composeMessage(
        row.kind === "call"
          ? "Tell the student what came of the admissions call you placed on their behalf — summarize the outcome plainly, don't pad it."
          : "Tell the student admissions replied to the email you sent on their behalf — summarize what they said plainly, don't pad it.",
        { universityName: row.university_name, outcome: row.summary }
      );
      await space.send(text);

      if (row.kind === "call") {
        await pool.query(`UPDATE outreach_calls SET notified_at = now() WHERE id = $1`, [row.id]);
      } else {
        await pool.query(`UPDATE outreach_emails SET notified_at = now() WHERE id = $1`, [row.id]);
      }
      sent++;
    } catch (err) {
      // One student's unreachable/invalid target must not stop the rest of this tick's batch.
      console.error(`[outreachNotifier] couldn't notify ${row.id} (${row.university_name}):`, (err as Error).message);
    }
  }
  return sent;
}
