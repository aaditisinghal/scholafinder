/**
 * Background monitors: swipe-yes cards, outreach-customization prompts + outcomes, deadline
 * reminders (frequent), and policy re-checks (sparser, since each re-check is a real page
 * fetch + Gemini call). Started inside the boss process so it shares the live spaceRegistry —
 * see src/boss/index.ts.
 */
import cron from "node-cron";
import { pool } from "../db/pool.js";
import { checkAndNotifyDeadlines } from "../agents/deadlineAgent.js";
import { recheckFact } from "../agents/policyMonitorAgent.js";
import { notifyPendingSwipeYes } from "../agents/swipeNotifier.js";
import { notifyPendingOutreachOutcomes } from "../agents/outreachNotifier.js";
import { askPendingCustomization, resolveTimedOutCustomizations } from "../agents/outreachCustomization.js";
import { getSpace } from "../boss/spaceRegistry.js";
import { composeMessage } from "../boss/voice.js";
import { runAgent } from "../orchestration/bus.js";

export function startMonitors(): void {
  // Every 10 seconds: text the result of any web-deck yes-swipe, ask/resolve call-question
  // customization, and relay call/email outcomes — cron's 1-minute floor is too slow for any
  // of these to feel immediate, so they're plain intervals instead.
  setInterval(() => {
    notifyPendingSwipeYes().catch((err) => console.error("[swipeNotifier] error", err));
  }, 10_000);

  setInterval(() => {
    askPendingCustomization().catch((err) => console.error("[outreachCustomization] ask error", err));
    resolveTimedOutCustomizations().catch((err) => console.error("[outreachCustomization] timeout error", err));
  }, 10_000);

  setInterval(() => {
    notifyPendingOutreachOutcomes().catch((err) => console.error("[outreachNotifier] error", err));
  }, 10_000);

  // Every 10 minutes: deadline reminders.
  cron.schedule("*/10 * * * *", async () => {
    try {
      const sent = await runAgent("deadline", "Check upcoming deadlines", "cron tick", () => checkAndNotifyDeadlines(), (n) => `${n} reminder(s) sent`, {
        dispatchSource: [{ kind: "db", label: "deadlines table (reminded_at IS NULL, due <=14d)" }],
        resultSource: () => [{ kind: "db", label: "deadlines table (Tiger Data)" }],
      });
      if (sent > 0) console.log(`[deadlineAgent] sent ${sent} reminder(s)`);
    } catch (err) {
      console.error("[deadlineAgent] error", err);
    }
  });

  // Daily: re-check one previously-confirmed fact per university for drift.
  cron.schedule("0 6 * * *", async () => {
    try {
      const { rows } = await pool.query<{ university_id: string; fact_key: string }>(
        `SELECT DISTINCT university_id, fact_key FROM scholarship_facts WHERE status = 'confirmed'`
      );
      for (const row of rows) {
        const result = await runAgent(
          "policymonitor",
          "Recheck fact for drift",
          `${row.university_id}/${row.fact_key}`,
          () => recheckFact(row.university_id, row.fact_key),
          (r) => r.note,
          {
            dispatchSource: [{ kind: "db", label: `scholarship_facts WHERE status='confirmed'` }],
            resultSource: () => [{ kind: "url", label: "re-scraped aid_site_url, diffed against stored fact" }],
          }
        );
        if (result.changed) {
          console.log(`[policyMonitor] ${row.university_id}/${row.fact_key}: ${result.note}`);
          // Notify any student who has swiped yes on this university.
          const { rows: affected } = await pool.query<{ student_id: string }>(
            `SELECT student_id FROM swipes WHERE university_id = $1 AND decision = 'yes'`,
            [row.university_id]
          );
          const text = await composeMessage(
            "Give the student a heads-up that something changed about a scholarship fact for a university they're interested in — state plainly what changed.",
            { change: result.note }
          );
          for (const a of affected) {
            try {
              const space = await getSpace(a.student_id);
              await space?.send(text);
            } catch (err) {
              console.error(`[policyMonitor] couldn't notify student ${a.student_id}:`, (err as Error).message);
            }
          }
        }
      }
    } catch (err) {
      console.error("[policyMonitor] error", err);
    }
  });

  console.log(
    "Monitors started (swipe-notifier / outreach-customization / outreach-outcomes: every 10s, deadline: every 10m, policy-monitor: daily at 06:00)."
  );
}
