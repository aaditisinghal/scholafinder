/**
 * Need-aware/need-blind flag — folded into reconciliation rather than run standalone
 * (per the roster design: cheap fact, high "I had no idea" payoff, not worth its own pipeline).
 * This just reads the already-reconciled "need_aware" fact and renders the one-line warning
 * the boss agent shows on a swipe card.
 */
import { pool } from "../db/pool.js";

export async function needAwareWarning(universityId: string): Promise<string | null> {
  const { rows } = await pool.query<{ fact_value: string; status: string }>(
    `SELECT fact_value, status FROM scholarship_facts WHERE university_id = $1 AND fact_key = 'need_aware'`,
    [universityId]
  );
  if (rows.length === 0) return null;
  const { fact_value, status } = rows[0];
  if (status === "conflicting") {
    return "⚠️ Sources disagree on whether this school is need-aware for internationals — applying for aid may or may not affect your admission odds. Worth confirming directly.";
  }
  if (fact_value === "yes") {
    return "⚠️ This school is need-aware for international applicants: requesting aid can affect your admission chances. Most US schools are need-aware for internationals — only a handful are need-blind.";
  }
  return null;
}
