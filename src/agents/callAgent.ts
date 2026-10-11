/**
 * Call gatherer — places a real outbound call to international admissions via
 * ElevenLabs Conversational AI's native Twilio integration (Twilio number imported
 * into the ElevenLabs dashboard, so this agent only talks to the ElevenLabs API).
 * The student's custom questions (gathered by the boss agent over iMessage) are passed
 * in as dynamic variables so the agent actually asks them on the call.
 *
 * Verify endpoint shape against https://elevenlabs.io/docs/conversational-ai/phone-numbers/twilio-integration/outbound-calling
 * before the demo — this is a preview-stage API and has moved before.
 */
import "dotenv/config";
import { pool } from "../db/pool.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const AGENT_PHONE_NUMBER_ID = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

interface OutboundCallResponse {
  success: boolean;
  conversation_id?: string;
  callSid?: string;
  message?: string;
}

export async function placeAdmissionsCall(
  outreachCallId: string,
  toNumber: string,
  universityName: string,
  customQuestions: string[]
): Promise<void> {
  if (!ELEVENLABS_API_KEY || !AGENT_ID || !AGENT_PHONE_NUMBER_ID) {
    throw new Error("ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID / ELEVENLABS_AGENT_PHONE_NUMBER_ID must be set to place a real call.");
  }

  await pool.query(`UPDATE outreach_calls SET status = 'calling' WHERE id = $1`, [outreachCallId]);

  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: AGENT_ID,
      agent_phone_number_id: AGENT_PHONE_NUMBER_ID,
      to_number: toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: {
          university_name: universityName,
          custom_questions: customQuestions.join(" | "),
        },
      },
    }),
  });

  const data = (await res.json()) as OutboundCallResponse;

  if (!res.ok || !data.success) {
    await pool.query(`UPDATE outreach_calls SET status = 'failed' WHERE id = $1`, [outreachCallId]);
    throw new Error(`ElevenLabs outbound call failed: ${data.message ?? res.statusText}`);
  }

  await pool.query(
    `UPDATE outreach_calls SET twilio_call_sid = $1 WHERE id = $2`,
    [data.callSid ?? data.conversation_id ?? null, outreachCallId]
  );
}

/** Poll ElevenLabs for the finished conversation transcript and store it. */
export async function fetchCallTranscript(outreachCallId: string, conversationId: string): Promise<void> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY must be set.");

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
  });
  if (!res.ok) return; // call may still be in progress; caller should retry later

  const data = (await res.json()) as { status: string; transcript?: Array<{ role: string; message: string }> };
  if (data.status !== "done" || !data.transcript) return;

  const transcriptText = data.transcript.map((t) => `${t.role}: ${t.message}`).join("\n");
  await pool.query(
    `UPDATE outreach_calls SET status = 'completed', transcript = $1, completed_at = now() WHERE id = $2`,
    [transcriptText, outreachCallId]
  );
}
