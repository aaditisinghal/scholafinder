/**
 * Serves the Tinder-style swipe deck the boss agent links to from iMessage. Separate HTTP
 * surface from the Spectrum message loop — this is what actually renders photos and takes
 * drag gestures, since iMessage bubbles can't host that.
 */
import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rankUniversitiesForStudent } from "../agents/profileMatchAgent.js";
import { eligibilitySummary } from "../boss/swipe.js";
import { recordSwipe, type SwipeDecision } from "../agents/swipeDecision.js";

const here = dirname(fileURLToPath(import.meta.url));
const swipePageHtml = readFileSync(join(here, "public", "swipe.html"), "utf8");

export function createWebServer() {
  const app = express();
  app.use(express.json());

  app.get("/swipe/:studentId", (req, res) => {
    res.type("html").send(swipePageHtml.replace("__STUDENT_ID__", req.params.studentId));
  });

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

  return app;
}

export async function startWebServer(port = Number(process.env.WEB_PORT) || 3000): Promise<void> {
  const app = createWebServer();
  await new Promise<void>((resolve) => {
    app.listen(port, () => resolve());
  });
  console.log(`Swipe deck web server listening on http://localhost:${port}`);
}
