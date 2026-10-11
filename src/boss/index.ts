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
import { askForJson, Type } from "../llm.js";
import { recordEvent, runAgent } from "../orchestration/bus.js";

// Last-resort safety net: this process serves live iMessage traffic, so a single bad
// background task (a demo-flow run, a cron tick, an unawaited agent call somewhere) must
// never take the whole service down. Every call site should still be individually handled —
// this has already caught two cases where it wasn't (a bare-null JSON response, an unguarded
// empty-page scrape) and both killed the live service before this existed.
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

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

async function beginSwiping(studentId: string, tenantLabel: string, session: Session, send: (text: string) => Promise<unknown>) {
  session.stage = "swiping";
  const ranked = await runAgent(
    "profilematch",
    "Rank swipe stack",
    `student ${studentId}`,
    () => rankUniversitiesForStudent(studentId),
    (r) => `${r.length} universities ranked`,
    {
      tenant: studentId,
      tenantLabel,
      dispatchSource: [{ kind: "db", label: "preferences WHERE student_id=…" }],
      resultSource: () => [
        { kind: "db", label: "preferences, universities, swipes tables (Tiger Data)" },
      ],
    }
  );
  if (ranked.length === 0) {
    await send("No universities matched yet — the browser agent hasn't gathered any that fit your preferences. Check back soon.");
    return;
  }
  await send(
    `Got it. Found ${ranked.length} universities worth your time. Swipe through them here: ${WEB_BASE_URL}/swipe/${studentId}\n\nSwipe right (or tap yes) on the ones you want — I'll start researching deeper and calling/emailing admissions the moment you do. Text me "submitted <university>" once you actually apply.`
  );
}

async function handleSubmittedCommand(studentId: string, tenantLabel: string, text: string, session: Session, send: (text: string) => Promise<unknown>) {
  const { universityName } = await askForJson<{ universityName: string | null }>({
    system: `Extract the university name the student says they submitted an application to. Null if none found.`,
    prompt: text,
    maxTokens: 60,
    schema: { type: Type.OBJECT, properties: { universityName: { type: Type.STRING, nullable: true } }, required: ["universityName"] },
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

  await sendReward(studentId, tenantLabel, rows[0].id, studentRows[0].solana_wallet, rows[0].name, send);
}

async function sendReward(studentId: string, tenantLabel: string, universityId: string, wallet: string, universityName: string, send: (text: string) => Promise<unknown>) {
  try {
    const sig = await runAgent(
      "reward",
      "Send devnet SOL reward",
      `${universityName} · ${wallet.slice(0, 8)}…`,
      () => sendSubmissionReward(studentId, universityId, wallet),
      (s) => `tx ${s.slice(0, 12)}…`,
      {
        tenant: studentId,
        tenantLabel,
        externalParty: "Solana devnet",
        resultSource: (sig) => [{ kind: "api", label: `Solana devnet RPC — on-chain tx ${sig.slice(0, 20)}…` }],
      }
    );
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

    recordEvent({
      kind: "inbound",
      from: "imessage",
      to: "boss",
      agent: "boss",
      label: "iMessage text",
      summary: text,
      status: "success",
      tenant: imessageId,
      tenantLabel: imessageId,
      source: [{ kind: "api", label: "Spectrum (Photon) iMessage webhook" }],
    });
    const tracedSend = (t: string) => {
      recordEvent({
        kind: "log",
        from: "boss",
        to: "imessage",
        agent: "boss",
        label: "Boss reply",
        summary: t.slice(0, 160),
        status: "success",
        tenant: imessageId,
        tenantLabel: imessageId,
      });
      return space.send(t);
    };

    await space.responding(async () => {
      try {
        await handleMessage({ send: tracedSend }, imessageId, text);
      } catch (err) {
        console.error("[boss] error handling message:", err);
        await tracedSend("Sorry, something went wrong on my end — try that again?").catch(() => {});
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
    await handleSubmittedCommand(studentId, imessageId, text, session, (t) => space.send(t));
    return;
  }

  if (session.stage === "awaiting_wallet" && session.awaitingWalletForUniversityId) {
    await pool.query(`UPDATE students SET solana_wallet = $1 WHERE id = $2`, [text, studentId]);
    const { rows } = await pool.query<{ name: string }>(`SELECT name FROM universities WHERE id = $1`, [session.awaitingWalletForUniversityId]);
    await sendReward(studentId, imessageId, session.awaitingWalletForUniversityId, text, rows[0]?.name ?? "that school", (t) => space.send(t));
    session.stage = "swiping";
    return;
  }

  if (session.stage === "new") {
    const already = await hasPreferences(studentId);
    if (already) {
      await beginSwiping(studentId, imessageId, session, (t) => space.send(t));
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
      await beginSwiping(studentId, imessageId, session, (t) => space.send(t));
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
