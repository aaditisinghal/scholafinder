/**
 * Boss agent — the only thing that talks to the student. Lives on iMessage via Spectrum.
 * Runs onboarding, presents the swipe stack, routes outreach customization, and relays
 * background-agent results (deadlines, policy changes, reward confirmations).
 *
 * Every other agent in the roster is deployed from here and reads/writes Tiger Data directly —
 * see src/agents/*, src/reward/solana.ts, src/monitors/scheduler.ts.
 */
import "dotenv/config";
import { Spectrum } from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";
import { pool } from "../db/pool.js";
import { startWebServer } from "../web/server.js";
import { startMonitors } from "../monitors/scheduler.js";
import { registerSpace } from "./spaceRegistry.js";
import { ONBOARDING_QUESTIONS, advanceOnboarding, startSession, type OnboardingSession } from "./onboarding.js";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { sendSubmissionReward } from "../reward/solana.js";
import { askForJson } from "../llm.js";

const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://localhost:3000";

type Stage = "new" | "onboarding" | "swiping" | "awaiting_wallet";

interface Session {
  stage: Stage;
  onboarding?: OnboardingSession;
  awaitingWalletForUniversityId?: string;
}

const sessions = new Map<string, Session>();

async function getOrCreateStudent(imessageId: string, displayName?: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO students (imessage_id, display_name) VALUES ($1, $2)
     ON CONFLICT (imessage_id) DO UPDATE SET display_name = COALESCE(students.display_name, $2)
     RETURNING id`,
    [imessageId, displayName ?? null]
  );
  return rows[0].id;
}

async function hasPreferences(studentId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM preferences WHERE student_id = $1`, [studentId]);
  return rows.length > 0;
}

function introLine(): string {
  return [
    "Hey — I'm ScholarFinder. I'll find US universities that actually take international students and actually fund them, then handle the research and outreach for you.",
    "A few quick questions first.",
    ONBOARDING_QUESTIONS[0].prompt,
  ].join("\n\n");
}

async function beginSwiping(studentId: string, session: Session, send: (text: string) => Promise<unknown>) {
  session.stage = "swiping";
  const ranked = await rankUniversitiesForStudent(studentId);
  if (ranked.length === 0) {
    await send("No universities matched yet — the browser agent hasn't gathered any that fit your preferences. Check back soon.");
    return;
  }
  await send(
    `Got it. Found ${ranked.length} universities worth your time. Swipe through them here: ${WEB_BASE_URL}/swipe/${studentId}\n\nSwipe right (or tap yes) on the ones you want — I'll start researching deeper and calling/emailing admissions the moment you do. Text me "submitted <university>" once you actually apply.`
  );
}

async function handleSubmittedCommand(studentId: string, text: string, session: Session, send: (text: string) => Promise<unknown>) {
  const { universityName } = await askForJson<{ universityName: string | null }>({
    system: `Extract the university name the student says they submitted an application to. Null if none found.`,
    prompt: text,
    maxTokens: 60,
  });
  if (!universityName) {
    await send(`Which university did you submit to?`);
    return;
  }
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM universities WHERE name ILIKE $1 LIMIT 1`,
    [`%${universityName}%`]
  );
  if (rows.length === 0) {
    await send(`I don't have "${universityName}" in my list yet, but congrats on submitting! 🎉`);
    return;
  }

  const { rows: studentRows } = await pool.query<{ solana_wallet: string | null }>(
    `SELECT solana_wallet FROM students WHERE id = $1`,
    [studentId]
  );

  if (!studentRows[0]?.solana_wallet) {
    session.stage = "awaiting_wallet";
    session.awaitingWalletForUniversityId = rows[0].id;
    await send(`🎉 Congrats on submitting to ${rows[0].name}! Drop a Solana devnet wallet address and I'll send a small token reward.`);
    return;
  }

  await sendReward(studentId, rows[0].id, studentRows[0].solana_wallet, rows[0].name, send);
}

async function sendReward(studentId: string, universityId: string, wallet: string, universityName: string, send: (text: string) => Promise<unknown>) {
  try {
    const sig = await sendSubmissionReward(studentId, universityId, wallet);
    await send(`💸 Sent — devnet tx: ${sig}`);
  } catch (err) {
    await send(`Couldn't send the reward right now (${(err as Error).message}). I've logged it and will retry.`);
  }
}

async function main() {
  const provider = process.env.SPECTRUM_PROVIDER === "imessage" ? "imessage" : "terminal";

  let app;
  if (provider === "imessage") {
    const { imessage } = await import("spectrum-ts/providers/imessage");
    const projectId = process.env.SPECTRUM_PROJECT_ID;
    const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
    if (!projectId || !projectSecret) {
      throw new Error("SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET must be set for the imessage provider.");
    }
    app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
  } else {
    app = await Spectrum({ providers: [terminal.config()] });
  }

  await startWebServer();
  startMonitors();
  console.log(`Boss agent running on provider: ${provider}`);

  for await (const [space, message] of app.messages) {
    if (message.content.type !== "text") continue;
    const text = message.content.text.trim();
    const imessageId = message.sender?.id ?? "unknown";

    await space.responding(async () => {
      try {
        await handleMessage(space, imessageId, text);
      } catch (err) {
        console.error("[boss] error handling message:", err);
        await space.send("Sorry, something went wrong on my end — try that again?").catch(() => {});
      }
    });
  }
}

async function handleMessage(space: { send(text: string): Promise<unknown> }, imessageId: string, text: string) {
  const studentId = await getOrCreateStudent(imessageId);
  registerSpace(studentId, { send: (t: string) => space.send(t) });

  let session = sessions.get(studentId);
  if (!session) {
    session = { stage: "new" };
    sessions.set(studentId, session);
  }

  // "submitted <school>" works from any stage.
  if (/^submitted\b/i.test(text)) {
    await handleSubmittedCommand(studentId, text, session, (t) => space.send(t));
    return;
  }

  if (session.stage === "awaiting_wallet" && session.awaitingWalletForUniversityId) {
    await pool.query(`UPDATE students SET solana_wallet = $1 WHERE id = $2`, [text, studentId]);
    const { rows } = await pool.query<{ name: string }>(`SELECT name FROM universities WHERE id = $1`, [session.awaitingWalletForUniversityId]);
    await sendReward(studentId, session.awaitingWalletForUniversityId, text, rows[0]?.name ?? "that school", (t) => space.send(t));
    session.stage = "swiping";
    return;
  }

  if (session.stage === "new") {
    const already = await hasPreferences(studentId);
    if (already) {
      await beginSwiping(studentId, session, (t) => space.send(t));
    } else {
      session.stage = "onboarding";
      session.onboarding = startSession(studentId);
      await space.send(introLine());
    }
    return;
  }

  if (session.stage === "onboarding" && session.onboarding) {
    const next = await advanceOnboarding(session.onboarding, text);
    if (next) {
      await space.send(next.prompt);
    } else {
      await beginSwiping(studentId, session, (t) => space.send(t));
    }
    return;
  }

  if (session.stage === "swiping") {
    await space.send(`Your swipe deck's still here: ${WEB_BASE_URL}/swipe/${studentId}\n\nOnce you've applied somewhere, text me "submitted <university>".`);
    return;
  }

  await space.send(`Text "let's get started" to begin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
