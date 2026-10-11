/**
 * Reconciliation agent — the keystone resolver.
 * Takes every candidate observation for one (university, fact_key) from
 * scholarship_fact_candidates and emits exactly one row in scholarship_facts,
 * with a status that tells the rest of the system whether to trust it:
 *   confirmed   — candidates agree, or one is clearly more authoritative
 *   conflicting — candidates disagree and no source dominates; surfaced, never silently picked
 *   stale       — no candidate observed recently enough to trust (handled by policyMonitorAgent)
 */
import { pool } from "../db/pool.js";
import { askForJson, Type } from "../llm.js";
import type { FactCandidate } from "../types.js";

const SOURCE_AUTHORITY: Record<FactCandidate["source_agent"], number> = {
  call: 3,      // a human admissions officer, asked directly, wins most conflicts
  email: 2,
  browser: 2,
  seed: 1,      // seed data is a placeholder guess, lowest trust
};

interface ReconciliationResult {
  fact_value: string;
  confidence: number;
  status: "confirmed" | "conflicting" | "stale";
  reasoning: string;
}

export async function reconcileFact(universityId: string, factKey: string): Promise<void> {
  const { rows: candidates } = await pool.query<FactCandidate>(
    `SELECT university_id, fact_key, fact_value, source_agent, provenance_url, confidence, observed_at
     FROM scholarship_fact_candidates
     WHERE university_id = $1 AND fact_key = $2
     ORDER BY observed_at DESC`,
    [universityId, factKey]
  );

  if (candidates.length === 0) return;

  const distinctValues = new Set(candidates.map((c) => c.fact_value));

  let result: ReconciliationResult;
  if (distinctValues.size === 1) {
    // All sources agree — no need to spend a Claude call on it.
    const best = candidates.sort((a, b) => SOURCE_AUTHORITY[b.source_agent] - SOURCE_AUTHORITY[a.source_agent])[0];
    result = {
      fact_value: best.fact_value,
      confidence: Math.min(0.95, Math.max(...candidates.map((c) => c.confidence)) + 0.1 * (candidates.length - 1)),
      status: "confirmed",
      reasoning: "All sources agree.",
    };
  } else {
    // Real disagreement — let Claude weigh source authority + confidence + recency and say so plainly.
    result = await askForJson<ReconciliationResult>({
      system: `You are the reconciliation agent for an international-student scholarship finder.
Source authority (highest to lowest trust when sources conflict): call > email ≈ browser > seed.
Never silently average or guess past a genuine conflict — if two authoritative sources truly disagree
(e.g. the website says "aid for all" but an admissions officer said "citizens only"), set status to
"conflicting" and pick the higher-authority value only if one source is clearly more authoritative AND
more recent; otherwise keep status "conflicting" and explain why in reasoning.`,
      prompt: `Fact key: ${factKey}\nCandidates:\n${JSON.stringify(candidates, null, 2)}`,
      maxTokens: 400,
      schema: {
        type: Type.OBJECT,
        properties: {
          fact_value: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          status: { type: Type.STRING, enum: ["confirmed", "conflicting", "stale"] },
          reasoning: { type: Type.STRING },
        },
        required: ["fact_value", "confidence", "status", "reasoning"],
      },
    });
  }

  await pool.query(
    `INSERT INTO scholarship_facts (university_id, fact_key, fact_value, confidence, status, provenance, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (university_id, fact_key)
     DO UPDATE SET fact_value = $3, confidence = $4, status = $5, provenance = $6, updated_at = now()`,
    [
      universityId,
      factKey,
      result.fact_value,
      result.confidence,
      result.status,
      JSON.stringify(
        candidates.map((c) => ({ source_agent: c.source_agent, url: c.provenance_url, value: c.fact_value, observed_at: c.observed_at }))
      ),
    ]
  );
}

/** Reconcile every (university, fact_key) pair that has at least one unreconciled candidate. */
export async function reconcileAllPending(): Promise<number> {
  const { rows } = await pool.query<{ university_id: string; fact_key: string }>(
    `SELECT DISTINCT c.university_id, c.fact_key
     FROM scholarship_fact_candidates c
     LEFT JOIN scholarship_facts f
       ON f.university_id = c.university_id AND f.fact_key = c.fact_key AND f.updated_at > c.observed_at
     WHERE f.university_id IS NULL`
  );
  for (const row of rows) {
    await reconcileFact(row.university_id, row.fact_key);
  }
  return rows.length;
}
