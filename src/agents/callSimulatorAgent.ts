/**
 * Call simulator — demo stand-in for the real call agent (src/agents/callAgent.ts).
 *
 * Real admissions offices don't pick up on weekends/after hours, and we don't have a Twilio
 * number imported into ElevenLabs yet, so this generates a realistic two-sided transcript
 * (ScholarFinder's caller persona + a simulated admissions officer) grounded in the university's
 * actual reconciled scholarship_facts, then renders the officer's half as real ElevenLabs audio.
 *
 * Everything this writes is clearly marked simulated — never presented as a real completed call.
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { pool } from "../db/pool.js";
import { streamText } from "../llm.js";
import { emitStreamChunk } from "../orchestration/bus.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OFFICER_VOICE_ID = "XrExE9yKIg1WjnnlVkGX"; // Matilda — professional, upbeat, middle-aged

const here = dirname(fileURLToPath(import.meta.url));
// Must match GENERATED_AUDIO_DIR in src/web/server.ts, which serves this directory at /audio.
const AUDIO_DIR = join(here, "..", "web", "generated", "audio");

interface TranscriptTurn {
  speaker: "caller" | "officer";
  text: string;
}

function parseTranscript(raw: string): { turns: TranscriptTurn[]; outcome: string } {
  const turns: TranscriptTurn[] = [];
  let outcome = "";
  for (const line of raw.split("\n")) {
    const m = line.match(/^(CALLER|OFFICER|OUTCOME):\s*(.*)$/i);
    if (!m) continue;
    const [, who, text] = m;
    if (who.toUpperCase() === "OUTCOME") outcome = text.trim();
    else turns.push({ speaker: who.toUpperCase() === "CALLER" ? "caller" : "officer", text: text.trim() });
  }
  return { turns, outcome };
}

export async function simulateAdmissionsCall(
  outreachCallId: string,
  universityId: string,
  customQuestions: string[],
  dispatchId?: string,
  tenant?: string,
  tenantLabel?: string
): Promise<{ transcript: string; audioPath: string | null }> {
  const [{ rows: uniRows }, { rows: factRows }] = await Promise.all([
    pool.query(`SELECT name FROM universities WHERE id = $1`, [universityId]),
    pool.query(`SELECT fact_key, fact_value, status FROM scholarship_facts WHERE university_id = $1`, [universityId]),
  ]);
  const universityName = uniRows[0]?.name ?? "the university";

  let raw = "";
  for await (const chunk of streamText({
    system: `Write a realistic phone call transcript between a ScholarFinder caller (calling on behalf
of a prospective international student) and a university admissions/financial-aid officer at ${universityName}.
Ground every fact the officer states in the provided scholarship_facts — if a fact's status is "conflicting"
or it's simply missing, have the officer be appropriately vague/uncertain rather than inventing a confident
number. The caller asks the given questions naturally, one at a time, like a real phone call (short turns,
acknowledgements, no monologues). 6-10 turns total. This is for a hackathon demo of an otherwise-real system —
make it sound like a real call, not a script.

Output format, plain text, one line per turn, nothing else:
CALLER: <line>
OFFICER: <line>
... (alternating, 6-10 lines total)
OUTCOME: <one-sentence summary of what was learned>`,
    prompt: JSON.stringify({ questions: customQuestions, scholarship_facts: factRows }),
    maxTokens: 1200,
  })) {
    raw += chunk;
    if (dispatchId) emitStreamChunk(dispatchId, "call", tenant ?? "system", tenantLabel ?? "system", chunk);
  }

  const { turns, outcome } = parseTranscript(raw);
  const transcriptText = turns.map((t) => `${t.speaker === "caller" ? "ScholarFinder" : "Admissions Officer"}: ${t.text}`).join("\n");

  let audioPath: string | null = null;
  if (ELEVENLABS_API_KEY && turns.length > 0) {
    try {
      const officerLines = turns.filter((t) => t.speaker === "officer").map((t) => t.text).join(" ");
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${OFFICER_VOICE_ID}`, {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ text: officerLines, model_id: "eleven_turbo_v2_5" }),
      });
      if (res.ok) {
        await mkdir(AUDIO_DIR, { recursive: true });
        const buf = Buffer.from(await res.arrayBuffer());
        const filename = `${outreachCallId}.mp3`;
        await writeFile(join(AUDIO_DIR, filename), buf);
        audioPath = `/audio/${filename}`;
      } else {
        console.error("[callSimulator] TTS failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("[callSimulator] TTS error:", err);
    }
  }

  const labeledTranscript = `[SIMULATED DEMO CALL — real admissions offices don't answer on weekends; this transcript is Gemini-generated and grounded in reconciled scholarship_facts for ${universityName}, not a real conversation]\n\n${transcriptText}\n\n[Outcome: ${outcome}]`;

  await pool.query(
    `UPDATE outreach_calls SET status = 'completed', transcript = $1, completed_at = now() WHERE id = $2`,
    [labeledTranscript, outreachCallId]
  );

  return { transcript: labeledTranscript, audioPath };
}
