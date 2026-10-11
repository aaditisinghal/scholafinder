// One-off generator for the hardcoded showcase call audio. Run once (or whenever the
// transcript changes): node --import=tsx scripts/generate-showcase-call.mjs
// Reads the transcript directly from web-app/src/orchestration/showcaseCall.ts so the
// text and the generated filenames never drift apart.
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOWCASE_CALL } from "../web-app/src/orchestration/showcaseCall.ts";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

const VOICE = {
  caller: "TX3LPaxmHKxFdv7VOQHJ", // Liam — confident, energetic young voice for the Scholafinder AI caller
  officer: "XrExE9yKIg1WjnnlVkGX", // Matilda — professional, upbeat middle-aged voice for the admissions officer
};

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "web-app", "public", "showcase-call");

async function synth(text, voiceId, outPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status}): ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  console.log(`  wrote ${outPath} (${buf.length} bytes)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [i, turn] of SHOWCASE_CALL.entries()) {
    const filename = turn.audio.split("/").pop();
    const outPath = join(OUT_DIR, filename);
    console.log(`[${i + 1}/${SHOWCASE_CALL.length}] ${turn.speaker}: ${turn.text.slice(0, 50)}...`);
    await synth(turn.text, VOICE[turn.speaker], outPath);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
