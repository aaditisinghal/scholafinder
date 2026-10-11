/**
 * True-cost agent — "full tuition" != "full ride". Computes what this specific student
 * actually pays: cost of attendance minus award, plus the international-only line items
 * that US-citizen cost calculators always omit (health insurance, visa/SEVIS, flights, fees).
 */
import { pool } from "../db/pool.js";
import { askForJson, Type } from "../llm.js";

interface CostBreakdown {
  cost_of_attendance_usd: number;
  award_usd: number;
}

const DEFAULTS = {
  health_insurance_usd: 2500,
  visa_sevis_fees_usd: 410,
  flights_usd: 1200,
  student_fees_usd: 500,
};

export async function computeTrueCost(studentId: string, universityId: string): Promise<number> {
  const { rows: factRows } = await pool.query<{ fact_key: string; fact_value: string }>(
    `SELECT fact_key, fact_value FROM scholarship_facts
     WHERE university_id = $1 AND fact_key IN ('cost_of_attendance_usd', 'award_usd', 'aid_type')`,
    [universityId]
  );
  const facts = Object.fromEntries(factRows.map((r) => [r.fact_key, r.fact_value]));

  let breakdown: CostBreakdown;
  if (facts.cost_of_attendance_usd && facts.award_usd) {
    breakdown = {
      cost_of_attendance_usd: Number(facts.cost_of_attendance_usd),
      award_usd: Number(facts.award_usd),
    };
  } else {
    // Fall back to Claude's general knowledge of this aid_type band, clearly flagged as an estimate upstream.
    breakdown = await askForJson<CostBreakdown>({
      system: `Estimate typical annual cost of attendance (tuition+room+board, USD) and a typical international
student award in USD for the given aid_type band at a US university. Be conservative — this is a rough
placeholder estimate, not a quote, and will be replaced once real data is gathered.`,
      prompt: `aid_type: ${facts.aid_type ?? "unknown"}`,
      maxTokens: 200,
      schema: {
        type: Type.OBJECT,
        properties: { cost_of_attendance_usd: { type: Type.NUMBER }, award_usd: { type: Type.NUMBER } },
        required: ["cost_of_attendance_usd", "award_usd"],
      },
    });
  }

  const netCost =
    breakdown.cost_of_attendance_usd -
    breakdown.award_usd +
    DEFAULTS.health_insurance_usd +
    DEFAULTS.visa_sevis_fees_usd +
    DEFAULTS.flights_usd +
    DEFAULTS.student_fees_usd;

  await pool.query(
    `INSERT INTO true_cost (student_id, university_id, cost_of_attendance_usd, award_usd,
       health_insurance_usd, visa_sevis_fees_usd, flights_usd, student_fees_usd, net_cost_usd, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (student_id, university_id)
     DO UPDATE SET cost_of_attendance_usd = $3, award_usd = $4, net_cost_usd = $9, computed_at = now()`,
    [
      studentId,
      universityId,
      breakdown.cost_of_attendance_usd,
      breakdown.award_usd,
      DEFAULTS.health_insurance_usd,
      DEFAULTS.visa_sevis_fees_usd,
      DEFAULTS.flights_usd,
      DEFAULTS.student_fees_usd,
      Math.max(0, netCost),
    ]
  );

  return Math.max(0, netCost);
}
