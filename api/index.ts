/**
 * Vercel serverless entry point for the swipe-deck web server only — the boss agent
 * (iMessage listener + cron monitors) is a persistent process and can't run here.
 * See createWebServer() in src/web/server.ts for the actual routes.
 */
import { createWebServer } from "../src/web/server.js";

export default createWebServer();
