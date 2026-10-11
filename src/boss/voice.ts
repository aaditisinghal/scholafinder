/**
 * Shared "voice" for every dynamic message the boss agent sends — confirmations, outcome
 * summaries, reminders, policy-drift notes, re-prompts. The 7 onboarding questions are
 * deliberately NOT run through this (see src/boss/onboarding.ts): fixed wording there keeps
 * per-turn latency low and keeps the answer-parsing schemas reliable, which matters more than
 * variety for a data-collection flow. Everything else benefits from sounding like a person
 * texting, not a template filling in blanks.
 */
import { streamText } from "../llm.js";

export const BOSS_VOICE_SYSTEM_PROMPT = `You are Scholafinder, texting a high-school senior who is applying to US universities as an international student. Write ONE short iMessage reply, grounded only in the facts given to you — never invent a fact, a name, or a number that isn't in the prompt.

Voice: warm, direct, a little fun — like a sharp older friend who actually knows how financial aid works, not a customer-support bot. Short sentences, contractions are fine. At most one emoji, and only if it genuinely fits — never stack them, never use one just to decorate. No corporate language ("we're excited to inform you", "leverage", "seamless", "reach out"), no hype, no exclamation-point stacking.

Length: 1-3 sentences, iMessage-length — this is a text message, not an email. Plain text only: no markdown, no headers, no bullet lists, no emdashes doing the job of a comma.`;

/**
 * `instruction` is what THIS message needs to accomplish (e.g. "tell them the reward tx
 * succeeded and give the signature"); `context` is the structured data it's allowed to mention.
 * Combines with BOSS_VOICE_SYSTEM_PROMPT so every call site doesn't have to restate tone rules.
 */
export async function composeMessage(instruction: string, context: unknown = {}, maxTokens = 220): Promise<string> {
  let out = "";
  for await (const chunk of streamText({
    system: `${BOSS_VOICE_SYSTEM_PROMPT}\n\nWhat this message needs to do: ${instruction}`,
    prompt: JSON.stringify(context),
    maxTokens,
  })) {
    out += chunk;
  }
  return out.trim();
}

/**
 * Same as composeMessage, but for a message that must carry an exact value verbatim — a swipe-deck
 * link, a transaction signature — where an LLM paraphrasing it even slightly would break it. Gemini
 * writes around a literal placeholder token instead of the real value, which gets substituted in
 * afterward; if the model drops the token, the value is appended rather than silently lost.
 */
export async function composeMessageWithToken(instruction: string, context: unknown, token: string, value: string, maxTokens = 220): Promise<string> {
  const text = await composeMessage(
    `${instruction} Include the literal placeholder ${token} exactly once, exactly as written (don't translate it, reformat it, or put punctuation directly against it) — it gets swapped for the real value afterward.`,
    context,
    maxTokens
  );
  return text.includes(token) ? text.replace(token, value) : `${text}\n\n${value}`;
}
