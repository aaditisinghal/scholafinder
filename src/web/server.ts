/**
 * API for the swipe deck — the actual page is the React app in web-app/ (static, deployed
 * alongside this as Vercel functions). This is pure request/response, no page rendering.
 */
import "dotenv/config";
import express from "express";
import { Webhook } from "svix";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { cardDetails } from "../boss/swipe.js";
import { recordSwipe, type SwipeDecision } from "../agents/swipeDecision.js";
import { handleIncomingReply } from "../agents/emailAgent.js";
import { getDashboardSnapshot } from "./dashboard.js";
import { DASHBOARD_HTML } from "./dashboardPage.js";
import { getHistory, subscribe } from "../orchestration/bus.js";
import { runDemoFlow } from "../orchestration/demoFlow.js";
import { pool } from "../db/pool.js";

const here = dirname(fileURLToPath(import.meta.url));
// Simulated-call audio (see callSimulatorAgent.ts) is generated at runtime, so it's served
// straight from this API process rather than bundled into the Vercel-deployed web-app/ static site.
const GENERATED_AUDIO_DIR = join(here, "generated", "audio");

export function createWebServer() {
  const app = express();

  // Registered before the global express.json() below, with its own express.raw() middleware,
  // so this route's request body stays an untouched Buffer — svix needs the exact raw bytes
  // to verify the signature; a body that's already been JSON-parsed-and-restringified won't
  // match it bit-for-bit. See docs: resend.com/docs/webhooks/verify-webhooks-requests.
  app.post("/api/webhooks/resend-inbound", express.raw({ type: "application/json" }), async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      res.status(503).json({ error: "RESEND_WEBHOOK_SECRET is not configured." });
      return;
    }

    let event: { type: string; data: { email_id: string; to: string[] } };
    try {
      const wh = new Webhook(secret);
      // verify() throws on a bad signature and otherwise just returns void (this version of
      // svix doesn't hand back the parsed body) — req.body is the untouched Buffer from the
      // express.raw() middleware above, so it's parsed separately right after.
      wh.verify(req.body, {
        "svix-id": String(req.header("svix-id") ?? ""),
        "svix-timestamp": String(req.header("svix-timestamp") ?? ""),
        "svix-signature": String(req.header("svix-signature") ?? ""),
      });
      event = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch (err) {
      res.status(400).json({ error: `Invalid webhook signature: ${(err as Error).message}` });
      return;
    }

    if (event.type !== "email.received") {
      res.status(200).json({ ignored: event.type });
      return;
    }

    try {
      // The reply-to address on every outreach email is unique per row — reply+<outreachEmailId>@<domain>
      // (see RESEND_INBOUND_DOMAIN in src/agents/emailAgent.ts) — so routing a reply back to the right
      // outreach_emails row is just reading it out of whichever recipient address matches that shape.
      const toAddress = event.data.to.find((addr) => /^reply\+/.test(addr));
      const outreachEmailId = toAddress?.match(/^reply\+([^@]+)@/)?.[1];
      if (!outreachEmailId) {
        res.status(200).json({ ignored: "no reply+<id> recipient found" });
        return;
      }

      const { rows } = await pool.query<{ university_id: string }>(`SELECT university_id FROM outreach_emails WHERE id = $1`, [outreachEmailId]);
      const universityId = rows[0]?.university_id;
      if (!universityId) {
        res.status(200).json({ ignored: `no outreach_emails row for ${outreachEmailId}` });
        return;
      }

      const detail = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      }).then((r) => r.json() as Promise<{ text: string | null; html: string | null }>);
      const bodyText = detail.text ?? (detail.html ? detail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

      await handleIncomingReply(outreachEmailId, universityId, bodyText);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[resend-inbound] failed:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.use(express.json());
  app.use("/audio", express.static(GENERATED_AUDIO_DIR));

  app.get("/api/swipe-stack/:studentId", async (req, res) => {
    try {
      const ranked = await rankUniversitiesForStudent(req.params.studentId);
      const cards = await Promise.all(
        ranked.map(async (r) => {
          const details = await cardDetails(r.university.id);
          return {
            id: r.university.id,
            name: r.university.name,
            city: r.university.city,
            state: r.university.state,
            setting: r.university.setting,
            worldRanking: r.university.world_ranking,
            cultureTags: r.university.culture_tags ?? [],
            photoUrl: r.university.photo_url,
            matchReasons: r.reasons,
            matchScore: r.score,
            admissionsEmail: r.university.admissions_email,
            admissionsPhone: r.university.admissions_phone,
            aidSiteUrl: r.university.aid_site_url,
            ...details,
          };
        })
      );
      res.json({ cards });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/swipe", async (req, res) => {
    const { studentId, universityId, decision } = req.body as { studentId?: string; universityId?: string; decision?: SwipeDecision };
    if (!studentId || !universityId || !decision || !["yes", "no", "skip"].includes(decision)) {
      res.status(400).json({ error: "studentId, universityId and a valid decision are required." });
      return;
    }
    try {
      const result = await recordSwipe(studentId, universityId, decision);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/dashboard", (_req, res) => {
    res.type("html").send(DASHBOARD_HTML);
  });

  app.get("/api/dashboard", async (_req, res) => {
    try {
      res.json(await getDashboardSnapshot());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/orchestration/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: history\ndata: ${JSON.stringify(getHistory())}\n\n`);

    const unsubscribe = subscribe((e) => {
      res.write(`event: event\ndata: ${JSON.stringify(e)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 20000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post("/api/orchestration/demo", async (_req, res) => {
    try {
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM students ORDER BY created_at LIMIT 1`);
      const studentId = rows[0]?.id;
      if (!studentId) {
        res.status(400).json({ error: "No student in the database yet — text the iMessage line once first." });
        return;
      }
      res.json({ started: true, studentId });
      runDemoFlow(studentId).catch((err) => console.error("[demoFlow] failed:", err.message));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}

export async function startWebServer(port = Number(process.env.WEB_PORT) || 3000): Promise<void> {
  const app = createWebServer();
  await new Promise<void>((resolve) => {
    app.listen(port, () => resolve());
  });
  console.log(`Swipe deck API listening on http://localhost:${port} (page UI is served separately by web-app/)`);
}
