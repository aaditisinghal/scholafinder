/**
 * Browser gatherer — opens a university's aid/admissions page with Playwright,
 * hands the extracted text to Claude to pull out structured scholarship facts,
 * and writes candidates (never final facts — that's reconciliationAgent's job).
 */
import { chromium } from "playwright";
import { pool } from "../db/pool.js";
import { askForJson } from "../llm.js";

interface ExtractedFacts {
  international_eligible: "yes" | "no" | "unclear";
  need_aware: "yes" | "no" | "unclear";
  aid_type: "full_ride" | "full_need_based" | "merit_partial" | "partial" | "none_mentioned" | "unclear";
  cost_of_attendance_usd: number | null;
  award_usd: number | null;
  notes: string;
}

export async function scrapeUniversityAidPage(universityId: string, url: string): Promise<ExtractedFacts> {
  const browser = await chromium.launch();
  let pageText = "";
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    pageText = await page.innerText("body");
  } finally {
    await browser.close();
  }

  const extracted = await askForJson<ExtractedFacts>({
    system: `Extract international-student scholarship facts from this US university aid/admissions page text.
If the page genuinely doesn't say — many don't distinguish US-citizen vs international eligibility — use
"unclear" rather than guessing. Never infer eligibility from a page that only talks about FAFSA (FAFSA
requires US citizenship/eligible noncitizen status, so FAFSA-only pages usually mean internationals are
NOT eligible for that specific aid, but say "unclear" unless the page states it outright).`,
    prompt: pageText.slice(0, 15000),
    maxTokens: 500,
  });

  const observedAt = new Date().toISOString();
  const rowsToInsert: Array<[string, string]> = [
    ["international_eligible", extracted.international_eligible],
    ["need_aware", extracted.need_aware],
    ["aid_type", extracted.aid_type],
  ];
  if (extracted.cost_of_attendance_usd != null) rowsToInsert.push(["cost_of_attendance_usd", String(extracted.cost_of_attendance_usd)]);
  if (extracted.award_usd != null) rowsToInsert.push(["award_usd", String(extracted.award_usd)]);

  for (const [factKey, factValue] of rowsToInsert) {
    if (factValue === "unclear") continue; // don't pollute reconciliation with non-answers
    await pool.query(
      `INSERT INTO scholarship_fact_candidates (university_id, fact_key, fact_value, source_agent, provenance_url, confidence, observed_at)
       VALUES ($1,$2,$3,'browser',$4,0.75,$5)`,
      [universityId, factKey, factValue, url, observedAt]
    );
  }

  return extracted;
}
