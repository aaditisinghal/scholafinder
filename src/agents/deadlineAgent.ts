/**
 * Deadline agent — reminds the boss agent of upcoming deadlines so it can iMessage the student.
 * Pure background job: finds due-soon, not-yet-reminded deadlines and sends through whatever
 * space getSpace() can resolve for that student (live conversation or, failing that, a fresh
 * resolve from their stored platform id — see src/boss/spaceRegistry.ts).
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";
import { composeMessage } from "../boss/voice.js";

const REMIND_WINDOW_DAYS = 14;

export async function checkAndNotifyDeadlines(): Promise<number> {
  const { rows } = await pool.query<{
    id: string;
    student_id: string;
    university_name: string;
    deadline_date: string;
    label: string;
  }>(
    `SELECT d.id, d.student_id, u.name AS university_name, d.deadline_date, d.label
     FROM deadlines d
     JOIN universities u ON u.id = d.university_id
     WHERE d.reminded_at IS NULL
       AND d.deadline_date <= (CURRENT_DATE + $1::int)
       AND d.deadline_date >= CURRENT_DATE`,
    [REMIND_WINDOW_DAYS]
  );

  let sent = 0;
  for (const row of rows) {
    try {
      const space = await getSpace(row.student_id);
      if (!space) continue; // can't resolve a space for this student yet; retry next tick
      const daysLeft = Math.ceil((new Date(row.deadline_date).getTime() - Date.now()) / 86_400_000);
      const text = await composeMessage(
        "Remind the student a deadline is coming up. Convey the university name, the deadline label, the date, and how many days are left — make the urgency clear if it's close (under 5 days), low-key if it's not.",
        { universityName: row.university_name, label: row.label, deadlineDate: row.deadline_date, daysLeft }
      );
      await space.send(text);
      await pool.query(`UPDATE deadlines SET reminded_at = now() WHERE id = $1`, [row.id]);
      sent++;
    } catch (err) {
      // One student's unreachable/invalid target must not stop the rest of this tick's batch.
      console.error(`[deadlineAgent] couldn't remind ${row.id} (${row.university_name}):`, (err as Error).message);
    }
  }
  return sent;
}
