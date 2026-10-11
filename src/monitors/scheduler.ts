/**
 * Background monitors: deadline reminders (frequent) and policy re-checks (sparser, since
 * each re-check is a real page fetch + Claude call). Started inside the boss process so it
 * shares the live spaceRegistry — see src/boss/index.ts.
 */
import cron from "node-cron";
import { pool } from "../db/pool.js";
import { checkAndNotifyDeadlines } from "../agents/deadlineAgent.js";
import { recheckFact } from "../agents/policyMonitorAgent.js";
import { notifyPendingSwipeYes } from "../agents/swipeNotifier.js";
import { getSpace } from "../boss/spaceRegistry.js";

export function startMonitors(): void {
  // Every 10 seconds: text the result of any web-deck yes-swipe — cron's 1-minute floor
  // is too slow for this to feel immediate, so it's a plain interval instead.
  setInterval(() => {
    notifyPendingSwipeYes().catch((err) => console.error("[swipeNotifier] error", err));
  }, 10_000);

  // Every 10 minutes: deadline reminders.
  cron.schedule("*/10 * * * *", async () => {
    try {
      const sent = await checkAndNotifyDeadlines();
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
        const result = await recheckFact(row.university_id, row.fact_key);
        if (result.changed) {
          console.log(`[policyMonitor] ${row.university_id}/${row.fact_key}: ${result.note}`);
          // Notify any student who has swiped yes on this university.
          const { rows: affected } = await pool.query<{ student_id: string }>(
            `SELECT student_id FROM swipes WHERE university_id = $1 AND decision = 'yes'`,
            [row.university_id]
          );
          for (const a of affected) {
            getSpace(a.student_id)?.send(`📋 Heads up — something changed: ${result.note}`);
          }
        }
      }
    } catch (err) {
      console.error("[policyMonitor] error", err);
    }
  });

  console.log("Monitors started (swipe-notifier: every 10s, deadline: every 10m, policy-monitor: daily at 06:00).");
}
