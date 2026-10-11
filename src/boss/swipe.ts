import { pool } from "../db/pool.js";

export async function eligibilitySummary(universityId: string): Promise<string | null> {
  const { rows } = await pool.query<{ fact_key: string; fact_value: string; status: string }>(
    `SELECT fact_key, fact_value, status FROM scholarship_facts WHERE university_id = $1 AND fact_key IN ('international_eligible', 'aid_type')`,
    [universityId]
  );
  if (rows.length === 0) return "No aid info gathered yet for this school.";

  const eligible = rows.find((r) => r.fact_key === "international_eligible");
  const aidType = rows.find((r) => r.fact_key === "aid_type");
  const parts: string[] = [];
  if (eligible) parts.push(`international students ${eligible.fact_value === "yes" ? "eligible" : "NOT confirmed eligible"}${eligible.status === "conflicting" ? " (sources conflict)" : ""}`);
  if (aidType) parts.push(`aid type: ${aidType.fact_value.replace(/_/g, " ")}`);
  return parts.join(" · ") || null;
}
