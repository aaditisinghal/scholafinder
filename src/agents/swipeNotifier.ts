/**
 * The swipe deck runs as a separate Vercel deployment from the boss agent, so a yes-swipe
 * there can't call the boss agent's in-memory spaceRegistry directly. This polls the DB
 * for yes-swipes with a saved card_text that haven't been texted yet, and sends them the
 * moment this process has a space registered for that student — the decoupling point for
 * "swipe on the web, get it on iMessage."
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";

export async function notifyPendingSwipeYes(): Promise<number> {
  const { rows } = await pool.query<{ id: string; student_id: string; card_text: string; university_name: string }>(
    `SELECT s.id, s.student_id, s.card_text, u.name AS university_name
     FROM swipes s
     JOIN universities u ON u.id = s.university_id
     WHERE s.decision = 'yes' AND s.card_text IS NOT NULL AND s.notified_at IS NULL`
  );

  let sent = 0;
  for (const row of rows) {
    const space = getSpace(row.student_id);
    if (!space) continue; // no open iMessage conversation yet this run; retry next tick
    await space.send(`🎓 You swiped yes on ${row.university_name}!\n\n${row.card_text}`);
    await pool.query(`UPDATE swipes SET notified_at = now() WHERE id = $1`, [row.id]);
    sent++;
  }
  return sent;
}
