/**
 * Email gatherer — async backup to the call agent. Drafts a question list from the DB,
 * sends it via Resend, and parses whatever reply eventually comes back into candidate facts.
 * Replies take 4-5 weeks per the problem statement, so this agent's job is "send and forget,
 * then make sense of whatever shows up" rather than anything synchronous.
 */
import "dotenv/config";
import { pool } from "../db/pool.js";
import { askForJson, Type } from "../llm.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;

export async function draftAndSendEmail(outreachEmailId: string, toAddress: string, universityName: string, customQuestions: string[]): Promise<void> {
  if (!RESEND_API_KEY || !FROM_ADDRESS) {
    throw new Error("RESEND_API_KEY / EMAIL_FROM_ADDRESS must be set to send a real email.");
  }

  const { body } = await askForJson<{ body: string }>({
    system: `Draft a short, polite email from a prospective international student to a US university's
international admissions office. Ask the given questions plainly. No flattery padding, no "I hope this
email finds you well" filler — admissions offices get thousands of these.`,
    prompt: `University: ${universityName}\nQuestions:\n${customQuestions.map((q) => `- ${q}`).join("\n")}`,
    maxTokens: 400,
    schema: { type: Type.OBJECT, properties: { body: { type: Type.STRING } }, required: ["body"] },
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: toAddress,
      reply_to: process.env.EMAIL_REPLY_TO_INBOX || FROM_ADDRESS,
      subject: `Prospective international student — questions about financial aid`,
      text: body,
    }),
  });

  if (!res.ok) {
    await pool.query(`UPDATE outreach_emails SET status = 'failed' WHERE id = $1`, [outreachEmailId]);
    throw new Error(`Resend send failed: ${res.statusText}`);
  }

  await pool.query(`UPDATE outreach_emails SET status = 'sent', sent_body = $1 WHERE id = $2`, [body, outreachEmailId]);
}

interface ParsedReply {
  facts: Record<string, string>;
  summary: string;
}

/** Call this when a reply lands in the dedicated reply-to inbox (wire up via your inbound-email webhook). */
export async function handleIncomingReply(outreachEmailId: string, universityId: string, replyBody: string): Promise<void> {
  const parsed = await askForJson<ParsedReply>({
    system: `Extract scholarship facts an admissions officer stated in this email reply. Only extract what
is explicitly stated — keys like international_eligible, need_aware, aid_type, cost_of_attendance_usd,
award_usd. Omit any key not actually addressed in the reply.`,
    prompt: replyBody,
    maxTokens: 400,
  });

  await pool.query(
    `UPDATE outreach_emails SET status = 'replied', reply_body = $1, parsed_facts = $2, replied_at = now() WHERE id = $3`,
    [replyBody, JSON.stringify(parsed.facts), outreachEmailId]
  );

  const observedAt = new Date().toISOString();
  for (const [factKey, factValue] of Object.entries(parsed.facts)) {
    await pool.query(
      `INSERT INTO scholarship_fact_candidates (university_id, fact_key, fact_value, source_agent, provenance_url, confidence, observed_at)
       VALUES ($1,$2,$3,'email',NULL,0.85,$4)`,
      [universityId, factKey, factValue, observedAt]
    );
  }
}
