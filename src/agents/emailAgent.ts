/**
 * Email gatherer — async backup to the call agent. Drafts a question list from the DB,
 * sends it via Resend, and parses whatever reply eventually comes back into candidate facts.
 * Replies can take 4-5 weeks per the problem statement, so "draft and send" and "handle a
 * reply" are two separate entry points below rather than one synchronous flow — the reply
 * itself now arrives automatically via Resend's Inbound webhook (see handleIncomingReply
 * and POST /api/webhooks/resend-inbound in src/web/server.ts), not a manual check.
 */
import "dotenv/config";
import { pool } from "../db/pool.js";
import { askForJson, streamText, Type } from "../llm.js";
import { emitStreamChunk } from "../orchestration/bus.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;
// Set after enabling Resend's Inbound feature on a receiving domain (dashboard step — see
// README). Once set, each outreach email gets a unique reply-to address so a reply can be
// routed straight back to its outreach_emails row (POST /api/webhooks/resend-inbound in
// src/web/server.ts). Until then, replies fall back to EMAIL_REPLY_TO_INBOX as before — a real
// inbox a human reads, but nothing this codebase can act on automatically.
const INBOUND_REPLY_DOMAIN = process.env.RESEND_INBOUND_DOMAIN;

export async function draftAndSendEmail(
  outreachEmailId: string,
  toAddress: string,
  universityName: string,
  customQuestions: string[],
  dispatchId?: string,
  tenant?: string,
  tenantLabel?: string
): Promise<void> {
  if (!RESEND_API_KEY || !FROM_ADDRESS) {
    throw new Error("RESEND_API_KEY / EMAIL_FROM_ADDRESS must be set to send a real email.");
  }

  let body = "";
  for await (const chunk of streamText({
    system: `Draft a short, polite email from a prospective international student to a US university's
international admissions office. Ask the given questions plainly. No flattery padding, no "I hope this
email finds you well" filler — admissions offices get thousands of these. Plain text only, no JSON.`,
    prompt: `University: ${universityName}\nQuestions:\n${customQuestions.map((q) => `- ${q}`).join("\n")}`,
    maxTokens: 400,
  })) {
    body += chunk;
    if (dispatchId) emitStreamChunk(dispatchId, "email", tenant ?? "system", tenantLabel ?? "system", chunk);
  }
  body = body.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: toAddress,
      reply_to: INBOUND_REPLY_DOMAIN ? `reply+${outreachEmailId}@${INBOUND_REPLY_DOMAIN}` : process.env.EMAIL_REPLY_TO_INBOX || FROM_ADDRESS,
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

/** Called by POST /api/webhooks/resend-inbound (src/web/server.ts) when a reply lands on a per-row reply-to address. */
export async function handleIncomingReply(outreachEmailId: string, universityId: string, replyBody: string): Promise<void> {
  const parsed = await askForJson<ParsedReply>({
    system: `Extract scholarship facts an admissions officer stated in this email reply. Only extract what
is explicitly stated — keys like international_eligible, need_aware, aid_type, cost_of_attendance_usd,
award_usd. Omit any key not actually addressed in the reply (set it to null).`,
    prompt: replyBody,
    maxTokens: 400,
    schema: {
      type: Type.OBJECT,
      properties: {
        facts: {
          type: Type.OBJECT,
          properties: {
            international_eligible: { type: Type.STRING, nullable: true },
            need_aware: { type: Type.STRING, nullable: true },
            aid_type: { type: Type.STRING, nullable: true },
            cost_of_attendance_usd: { type: Type.STRING, nullable: true },
            award_usd: { type: Type.STRING, nullable: true },
          },
        },
        summary: { type: Type.STRING },
      },
      required: ["facts", "summary"],
    },
  });

  await pool.query(
    `UPDATE outreach_emails SET status = 'replied', reply_body = $1, parsed_facts = $2, summary = $3, replied_at = now() WHERE id = $4`,
    [replyBody, JSON.stringify(parsed.facts), parsed.summary, outreachEmailId]
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
