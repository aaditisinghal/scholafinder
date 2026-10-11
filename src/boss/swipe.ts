import { pool } from "../db/pool.js";

export interface CardDetails {
  eligibility: string | null; // one-line human summary, for a simple caption
  internationalEligible: "yes" | "no" | "unclear";
  aidType: string | null;
  needAware: boolean | null;
  factsStatus: "confirmed" | "conflicting" | "missing"; // drives the "verified" badge
  deadlineEd: string | null;
  deadlineRd: string | null;
  testPolicy: string | null;
  applicationFeeUsd: number | null;
  feeWaiverAvailable: boolean | null;
  estimatedCostOfAttendanceUsd: number | null;
}

/** Everything a swipe card needs beyond the bare university row — aid facts + requirements, one call per card. */
export async function cardDetails(universityId: string): Promise<CardDetails> {
  const [{ rows: factRows }, { rows: reqRows }] = await Promise.all([
    pool.query<{ fact_key: string; fact_value: string; status: string }>(
      `SELECT fact_key, fact_value, status FROM scholarship_facts WHERE university_id = $1 AND fact_key IN ('international_eligible', 'aid_type', 'need_aware')`,
      [universityId]
    ),
    pool.query<{
      deadline_ed: string | null;
      deadline_rd: string | null;
      test_policy: string | null;
      application_fee_usd: string | null;
      fee_waiver_available: boolean | null;
      estimated_cost_of_attendance_usd: string | null;
    }>(
      `SELECT deadline_ed, deadline_rd, test_policy, application_fee_usd, fee_waiver_available, estimated_cost_of_attendance_usd
       FROM requirements_packets WHERE university_id = $1`,
      [universityId]
    ),
  ]);

  const eligible = factRows.find((r) => r.fact_key === "international_eligible");
  const aidType = factRows.find((r) => r.fact_key === "aid_type");
  const needAware = factRows.find((r) => r.fact_key === "need_aware");
  const req = reqRows[0];

  const summaryParts: string[] = [];
  if (eligible) {
    summaryParts.push(
      `international students ${eligible.fact_value === "yes" ? "eligible" : "NOT confirmed eligible"}${eligible.status === "conflicting" ? " (sources conflict)" : ""}`
    );
  }
  if (aidType) summaryParts.push(`aid type: ${aidType.fact_value.replace(/_/g, " ")}`);

  return {
    eligibility: summaryParts.join(" · ") || (factRows.length === 0 ? "No aid info gathered yet for this school." : null),
    internationalEligible: eligible ? (eligible.fact_value === "yes" ? "yes" : "no") : "unclear",
    aidType: aidType?.fact_value ?? null,
    needAware: needAware ? needAware.fact_value === "yes" : null,
    factsStatus: factRows.some((r) => r.status === "conflicting") ? "conflicting" : factRows.length > 0 ? "confirmed" : "missing",
    deadlineEd: req?.deadline_ed ?? null,
    deadlineRd: req?.deadline_rd ?? null,
    testPolicy: req?.test_policy ?? null,
    applicationFeeUsd: req?.application_fee_usd != null ? Number(req.application_fee_usd) : null,
    feeWaiverAvailable: req?.fee_waiver_available ?? null,
    estimatedCostOfAttendanceUsd: req?.estimated_cost_of_attendance_usd != null ? Number(req.estimated_cost_of_attendance_usd) : null,
  };
}
