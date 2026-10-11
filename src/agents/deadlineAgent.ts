/**
 * Deadline agent — reminds the boss agent of upcoming deadlines so it can iMessage the student.
 * Pure background job: finds due-soon, not-yet-reminded deadlines and sends through whatever
 * space is registered for that student.
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";

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
    const space = getSpace(row.student_id);
    if (!space) continue; // student hasn't opened a conversation yet this run; retry next tick
    const daysLeft = Math.ceil((new Date(row.deadline_date).getTime() - Date.now()) / 86_400_000);
    await space.send(`⏰ ${row.university_name} — ${row.label} is due ${row.deadline_date} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`);
    await pool.query(`UPDATE deadlines SET reminded_at = now() WHERE id = $1`, [row.id]);
    sent++;
  }
  return sent;
}
