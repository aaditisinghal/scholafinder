/**
 * API for the swipe deck — the actual page is the React app in web-app/ (static, deployed
 * alongside this as Vercel functions). This is pure request/response, no page rendering.
 */
import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { eligibilitySummary } from "../boss/swipe.js";
import { recordSwipe, type SwipeDecision } from "../agents/swipeDecision.js";
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
  app.use(express.json());
  app.use("/audio", express.static(GENERATED_AUDIO_DIR));

  app.get("/api/swipe-stack/:studentId", async (req, res) => {
    try {
      const ranked = await rankUniversitiesForStudent(req.params.studentId);
      const cards = await Promise.all(
        ranked.map(async (r) => ({
          id: r.university.id,
          name: r.university.name,
          city: r.university.city,
          state: r.university.state,
          worldRanking: r.university.world_ranking,
          cultureTags: r.university.culture_tags ?? [],
          photoUrl: r.university.photo_url,
          matchReasons: r.reasons,
          eligibility: await eligibilitySummary(r.university.id),
        }))
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
