import { pool } from "../db/pool.js";

const cache = new Map<string, string>();

/** Human-readable label for a student (their iMessage number) for the orchestration view's tenant list. */
export async function tenantLabelFor(studentId: string): Promise<string> {
  if (cache.has(studentId)) return cache.get(studentId)!;
  const { rows } = await pool.query<{ imessage_id: string }>(`SELECT imessage_id FROM students WHERE id = $1`, [studentId]);
  const label = rows[0]?.imessage_id ?? studentId.slice(0, 8);
  cache.set(studentId, label);
  return label;
}
