/**
 * The swipe deck runs as a separate Vercel deployment from the boss agent, so a yes-swipe
 * there can't call the boss agent's spaceRegistry directly. This polls the DB for yes-swipes
 * with a saved card_text that haven't been texted yet, and sends them the moment a space can
 * be resolved for that student — the decoupling point for "swipe on the web, get it on iMessage."
 */
import { pool } from "../db/pool.js";
import { getSpace } from "../boss/spaceRegistry.js";
import { composeMessage } from "../boss/voice.js";

export async function notifyPendingSwipeYes(): Promise<number> {
  const { rows } = await pool.query<{ id: string; student_id: string; card_text: string; university_name: string }>(
    `SELECT s.id, s.student_id, s.card_text, u.name AS university_name
     FROM swipes s
     JOIN universities u ON u.id = s.university_id
     WHERE s.decision = 'yes' AND s.card_text IS NOT NULL AND s.notified_at IS NULL`
  );

  let sent = 0;
  for (const row of rows) {
    try {
      const space = await getSpace(row.student_id);
      if (!space) continue; // no resolvable space for this student yet; retry next tick
      const intro = await composeMessage(
        "Tell the student, excitedly but briefly, that this is the scholarship card for the university they just swiped yes on. This is just the lead-in line — the full card text is appended after it, so don't repeat any of its details, just announce it.",
        { universityName: row.university_name }
      );
      await space.send(`${intro}\n\n${row.card_text}`);
      await pool.query(`UPDATE swipes SET notified_at = now() WHERE id = $1`, [row.id]);
      sent++;
    } catch (err) {
      // One student's unreachable/invalid target must not stop the rest of this tick's batch.
      console.error(`[swipeNotifier] couldn't notify ${row.id} (${row.university_name}):`, (err as Error).message);
    }
  }
  return sent;
}
