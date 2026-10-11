/**
 * Profile-match/ranking agent — scores each gathered university against this student's
 * stored preferences so the Tinder stack is ordered best-fit-first instead of randomly.
 */
import { pool } from "../db/pool.js";
import type { StudentPreferences, University } from "../types.js";

export interface RankedUniversity {
  university: University;
  score: number; // 0..100
  reasons: string[];
}

function scoreOne(u: University, prefs: StudentPreferences): RankedUniversity {
  let score = 50;
  const reasons: string[] = [];

  if (prefs.setting && u.setting === prefs.setting) {
    score += 15;
    reasons.push(`matches your ${prefs.setting} preference`);
  }
  if (prefs.culture && u.culture_tags?.includes(prefs.culture)) {
    score += 15;
    reasons.push(`has ${prefs.culture.replace("_", " ")} culture`);
  }
  if (prefs.minWorldRanking && prefs.maxWorldRanking && u.world_ranking) {
    if (u.world_ranking >= prefs.minWorldRanking && u.world_ranking <= prefs.maxWorldRanking) {
      score += 15;
      reasons.push(`ranked #${u.world_ranking}, in your target band`);
    } else {
      score -= 10;
    }
  }

  return { university: u, score: Math.max(0, Math.min(100, score)), reasons };
}

export async function rankUniversitiesForStudent(studentId: string): Promise<RankedUniversity[]> {
  const { rows: prefRows } = await pool.query(`SELECT * FROM preferences WHERE student_id = $1`, [studentId]);
  const prefs: StudentPreferences = prefRows[0]
    ? {
        culture: prefRows[0].culture,
        setting: prefRows[0].setting,
        aidType: prefRows[0].aid_type,
        minWorldRanking: prefRows[0].min_world_ranking,
        maxWorldRanking: prefRows[0].max_world_ranking,
        subject: prefRows[0].subject,
        subjectRankingMax: prefRows[0].subject_ranking_max,
        satScore: prefRows[0].sat_score,
        ieltsScore: prefRows[0].ielts_score,
        notes: prefRows[0].notes,
      }
    : {};

  const { rows: universities } = await pool.query<University>(
    `SELECT u.* FROM universities u
     WHERE u.id NOT IN (SELECT university_id FROM swipes WHERE student_id = $1)`,
    [studentId]
  );

  const ranked = universities.map((u) => scoreOne(u, prefs));
  ranked.sort((a, b) => b.score - a.score);

  for (const r of ranked) {
    await pool.query(
      `UPDATE swipes SET rank_score = $1 WHERE student_id = $2 AND university_id = $3`,
      [r.score, studentId, r.university.id]
    ).catch(() => {}); // no-op until a swipe row exists; rank is also returned directly for ordering the stack
  }

  return ranked;
}
