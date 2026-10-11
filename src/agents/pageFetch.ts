/**
 * Shared "safely fetch a page's visible text" helper. Used by both the browser gatherer and
 * anywhere else that needs raw page text for the model (requirements agent, policy-monitor
 * recheck). Centralized specifically so the empty-page guard below only has to exist once —
 * it already caused one production crash when a second, unguarded copy of this logic was
 * written inline in the demo-flow script.
 */
import { chromium } from "playwright";

export async function fetchPageText(url: string): Promise<string> {
  const browser = await chromium.launch();
  let pageText = "";
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    pageText = await page.innerText("body");
    if (pageText.trim().length < 200) {
      // Some aid pages render their real content client-side; domcontentloaded fires before
      // that JS runs. One retry with networkidle covers most of those without slowing the
      // common case (a page that already has real text) down.
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      pageText = await page.innerText("body");
    }
  } catch {
    return ""; // dead URL, DNS failure, timeout — caller treats "" the same as a JS-only page
  } finally {
    await browser.close();
  }
  return pageText;
}
