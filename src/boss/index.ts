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
import { PublicKey } from "@solana/web3.js";
import { pool } from "../db/pool.js";
import { startWebServer } from "../web/server.js";
import { startMonitors } from "../monitors/scheduler.js";
import { registerSpace, initSpaceResolver } from "./spaceRegistry.js";
import { composeMessage, composeMessageWithToken } from "./voice.js";
import { ONBOARDING_QUESTIONS, advanceOnboarding, startSession, type OnboardingSession } from "./onboarding.js";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { sendSubmissionReward } from "../reward/solana.js";
import { pendingCustomizationFor, resolveCustomizationReply } from "../agents/outreachCustomization.js";
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
const LINK_TOKEN = "{{LINK}}";
const TX_TOKEN = "{{TX}}";
const QUESTION_TOKEN = "{{QUESTION}}";

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
    "Hey — I'm Scholafinder. I'll find US universities that actually take international students and actually fund them, then handle the research and outreach for you.",
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
    const text = await composeMessage(
      "Tell the student no universities match their preferences yet because the browser agent hasn't gathered enough data — tell them to check back soon, keep it brief and upbeat, not apologetic."
    );
    await send(text);
    return;
  }
  const text = await composeMessageWithToken(
    `Tell the student how many universities you found that fit what they're after, then tell them to swipe through them at the link below (right/yes on the ones they want) — and that the moment they do, you'll start researching deeper and reaching out to admissions. Close by telling them to text you "submitted <university>" once they actually apply.`,
    { count: ranked.length },
    LINK_TOKEN,
    `${WEB_BASE_URL}/swipe/${studentId}`
  );
  await send(text);
}

async function handleSubmittedCommand(studentId: string, tenantLabel: string, text: string, session: Session, send: (text: string) => Promise<unknown>) {
  const { universityName } = await askForJson<{ universityName: string | null }>({
    system: `Extract the university name the student says they submitted an application to. Null if none found.`,
    prompt: text,
    maxTokens: 60,
    schema: { type: Type.OBJECT, properties: { universityName: { type: Type.STRING, nullable: true } }, required: ["universityName"] },
  });
  if (!universityName) {
    await send(await composeMessage("Ask which university they submitted to — you need the name to log it."));
    return;
  }
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM universities WHERE name ILIKE $1 LIMIT 1`,
    [`%${universityName}%`]
  );
  if (rows.length === 0) {
    await send(
      await composeMessage(
        "That university isn't in your tracked list yet, but congratulate the student warmly on submitting their application anyway.",
        { universityName }
      )
    );
    return;
  }

  const { rows: studentRows } = await pool.query<{ solana_wallet: string | null }>(
    `SELECT solana_wallet FROM students WHERE id = $1`,
    [studentId]
  );

  if (!studentRows[0]?.solana_wallet) {
    session.stage = "awaiting_wallet";
    session.awaitingWalletForUniversityId = rows[0].id;
    await send(
      await composeMessage(
        "Congratulate the student on submitting to this university, then ask them to drop a Solana devnet wallet address so you can send a small token reward.",
        { universityName: rows[0].name }
      )
    );
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
    const text = await composeMessageWithToken(
      "Tell the student their devnet SOL reward was sent, and include the transaction signature below for the record.",
      { universityName },
      TX_TOKEN,
      sig
    );
    await send(text);
  } catch (err) {
    // Deliberately not routed through Gemini: this fires when something already failed
    // (reward send, possibly even an LLM call upstream), so the reply here needs to not
    // depend on another network call that could fail the same way and leave the student
    // with no response at all.
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

    // Lets background jobs (deadline reminders, outreach outcomes, the call-customization
    // prompt) resolve a Space for ANY student at ANY time — restart or not — from their stored
    // imessage_id, instead of only the ones who've texted since this process last started.
    // See src/boss/spaceRegistry.ts for why this is safe with no prior inbound message.
    const platform = imessage(app);
    initSpaceResolver(async (id) => {
      const space = await platform.space.create(id);
      return { send: (t: string) => space.send(t) };
    });
  } else {
    app = await Spectrum({ providers: [terminal.config()] });
    // Terminal sessions have no persistent identity across restarts (see spaceRegistry.ts's
    // caveat), but wiring the same resolver keeps this branch's behavior consistent in-process.
    const platform = terminal(app);
    initSpaceResolver(async (id) => {
      const space = await platform.space.create(id);
      return { send: (t: string) => space.send(t) };
    });
  }

  await startWebServer();
  startMonitors();
  console.log(`Boss agent running on provider: ${provider}`);

  // A forceful kill (no graceful app.stop()) leaves the gRPC stream to Photon's servers torn
  // down mid-flight rather than closed — on a shared iMessage line, repeated ungraceful
  // restarts are exactly the kind of thing a reconnect-abuse heuristic would flag. SIGTERM is
  // what a normal process manager sends (and what PowerShell's Stop-Process without -Force
  // sends); SIGINT covers Ctrl+C during local dev.
  const shutdown = (signal: string) => {
    console.log(`[boss] received ${signal}, stopping Spectrum cleanly…`);
    app
      .stop()
      .catch((err) => console.error("[boss] error during Spectrum shutdown:", err))
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

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
    const trimmed = text.trim();
    try {
      new PublicKey(trimmed);
    } catch {
      await space.send(
        await composeMessage(
          "What they just sent doesn't look like a valid Solana wallet address. Ask them to double-check it and resend — stay light about it, this happens all the time."
        )
      );
      return; // stay in awaiting_wallet — no DB write, no stage change
    }
    await pool.query(`UPDATE students SET solana_wallet = $1 WHERE id = $2`, [trimmed, studentId]);
    const { rows } = await pool.query<{ name: string }>(`SELECT name FROM universities WHERE id = $1`, [session.awaitingWalletForUniversityId]);
    await sendReward(studentId, imessageId, session.awaitingWalletForUniversityId, trimmed, rows[0]?.name ?? "that school", (t) => space.send(t));
    session.stage = "swiping";
    return;
  }

  // Lives in Postgres rather than the in-memory session (outreachCustomization.ts), so a reply
  // routes correctly here even if this process restarted since the question was asked.
  const pendingCustomization = await pendingCustomizationFor(studentId);
  if (pendingCustomization) {
    await resolveCustomizationReply(pendingCustomization, text);
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
    const { next, parsedAnswer } = await advanceOnboarding(session.onboarding, text);
    if (next) {
      // The acknowledgment is genuinely Gemini-generated from what the student just said —
      // the next question itself is substituted in verbatim (composeMessageWithToken) so its
      // wording stays exact, which the next parseAnswer() call depends on for reliability.
      const reply = await composeMessageWithToken(
        "The student just answered an onboarding question — react to their specific answer in one short, natural sentence (reference what they actually said, grounded only in what's given here, don't invent anything they didn't say). If they said \"skip\", acknowledge that lightly instead. Then, on its own new line, include the next question placeholder.",
        { studentSaid: text, whatYouLearned: parsedAnswer },
        QUESTION_TOKEN,
        next.prompt
      );
      await space.send(reply);
    } else {
      await beginSwiping(studentId, imessageId, session, (t) => space.send(t));
    }
    return;
  }

  if (session.stage === "swiping") {
    await space.send(
      await composeMessageWithToken(
        "Remind the student their swipe deck is still waiting for them at the link below, and that once they've applied somewhere they should text you \"submitted <university>\".",
        {},
        LINK_TOKEN,
        `${WEB_BASE_URL}/swipe/${studentId}`
      )
    );
    return;
  }

  await space.send(`Text "let's get started" to begin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
