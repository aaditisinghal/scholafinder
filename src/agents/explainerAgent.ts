/**
 * Scholarship-explainer agent — on swipe-yes, turns the DB rows (facts, true cost,
 * requirements, need-aware flag) into a plain-language card a stressed 17-year-old
 * actually reads: who/what/why/when/how much, eligibility in one line, deadline, net cost.
 */
import { pool } from "../db/pool.js";
import { askForJson, Type } from "../llm.js";
import { needAwareWarning } from "./needAwareAgent.js";

export async function explainScholarship(studentId: string, universityId: string): Promise<string> {
  const [{ rows: uni }, { rows: facts }, { rows: packet }, { rows: cost }] = await Promise.all([
    pool.query(`SELECT name, city, state FROM universities WHERE id = $1`, [universityId]),
    pool.query(`SELECT fact_key, fact_value, status, confidence FROM scholarship_facts WHERE university_id = $1`, [universityId]),
    pool.query(`SELECT * FROM requirements_packets WHERE university_id = $1`, [universityId]),
    pool.query(`SELECT * FROM true_cost WHERE student_id = $1 AND university_id = $2`, [studentId, universityId]),
  ]);

  const warning = await needAwareWarning(universityId);

  const { card } = await askForJson<{ card: string }>({
    system: `Write a short iMessage-length card (max ~6 lines, no markdown headers) explaining this
scholarship/aid situation to an international high-schooler. Cover: who it's for, what it covers, why
it exists if known, when the deadline is, and the net cost after the award. If any fact has
status "conflicting", say so plainly instead of picking a side. Be concrete, no fluff, no hype.`,
    prompt: JSON.stringify({ university: uni[0], facts, requirements: packet[0], trueCost: cost[0] }),
    maxTokens: 400,
    schema: { type: Type.OBJECT, properties: { card: { type: Type.STRING } }, required: ["card"] },
  });

  return warning ? `${card}\n\n${warning}` : card;
}
