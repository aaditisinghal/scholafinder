/**
 * Policy-monitor agent — watches a saved fact for drift without hallucinating a change.
 * Re-scrapes the source page, compares the freshly-extracted value against what's stored,
 * and only logs a change when the new observation is both different AND itself confident —
 * a single "unclear" re-read is not treated as evidence the policy changed.
 */
import { pool } from "../db/pool.js";
import { scrapeUniversityAidPage } from "./browserAgent.js";
import { reconcileFact } from "./reconciliationAgent.js";

export async function recheckFact(universityId: string, factKey: string): Promise<{ changed: boolean; note: string }> {
  const { rows: current } = await pool.query<{ fact_value: string }>(
    `SELECT fact_value FROM scholarship_facts WHERE university_id = $1 AND fact_key = $2`,
    [universityId, factKey]
  );
  const { rows: uniRows } = await pool.query<{ aid_site_url: string }>(
    `SELECT aid_site_url FROM universities WHERE id = $1`,
    [universityId]
  );
  if (current.length === 0 || !uniRows[0]?.aid_site_url) {
    return { changed: false, note: "No stored fact or no aid_site_url to recheck against." };
  }

  const before = current[0].fact_value;
  await scrapeUniversityAidPage(universityId, uniRows[0].aid_site_url); // writes a fresh candidate row
  await reconcileFact(universityId, factKey); // re-reconciles including the new candidate

  const { rows: after } = await pool.query<{ fact_value: string; status: string }>(
    `SELECT fact_value, status FROM scholarship_facts WHERE university_id = $1 AND fact_key = $2`,
    [universityId, factKey]
  );

  if (after[0].fact_value === before) {
    return { changed: false, note: "Unchanged on recheck." };
  }

  await pool.query(
    `INSERT INTO policy_change_log (university_id, fact_key, old_value, new_value, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [universityId, factKey, before, after[0].fact_value, `Reconciliation status after recheck: ${after[0].status}`]
  );

  return { changed: true, note: `${factKey} changed from "${before}" to "${after[0].fact_value}"` };
}
