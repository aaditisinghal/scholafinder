import { GoogleGenAI, Type, type Schema } from "@google/genai";
import "dotenv/config";

export { Type };
export type { Schema };

// Vertex AI (service account via GOOGLE_APPLICATION_CREDENTIALS) takes priority when configured;
// falls back to a plain Gemini API key otherwise. Only one auth path is ever active at a time.
const useVertex = Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_APPLICATION_CREDENTIALS);

if (!useVertex && !process.env.GEMINI_API_KEY) {
  throw new Error(
    "Neither Vertex AI (GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS) nor GEMINI_API_KEY is set — copy .env.example to .env and fill one in."
  );
}

const genai = useVertex
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    })
  : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Vertex AI only serves dated/published model ids, not the AI-Studio-only "-latest" aliases.
export const MODEL = useVertex ? "gemini-2.5-flash" : "gemini-flash-latest";

/**
 * Ask Gemini for a single JSON object, no tool-use ceremony.
 * Pass `schema` whenever a field holds free-form prose (explainer cards, email bodies) —
 * plain `responseMimeType: "application/json"` without a schema lets Gemini emit raw
 * newlines inside a JSON string, which breaks JSON.parse; a Schema forces valid escaping.
 */
const RETRYABLE = /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/;

export async function askForJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  schema?: Schema;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await genai.models.generateContent({
        model: MODEL,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseSchema: opts.schema,
          maxOutputTokens: opts.maxTokens ?? 1024,
          // gemini-flash-latest defaults to extended thinking, which otherwise eats the whole
          // maxOutputTokens budget on hidden reasoning before writing any of the actual JSON
          // (MAX_TOKENS finish reason with a one-token-long answer). None of our agents need
          // chain-of-thought for short extraction/drafting tasks, so turn it off.
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = (res.text ?? "{}").trim();
      const jsonText = text.startsWith("```") ? text.replace(/^```(json)?/i, "").replace(/```$/, "").trim() : text;
      return JSON.parse(jsonText) as T;
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE.test(String(err)) || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Stream raw prose from Gemini token-by-token — for agents whose output is meant to be read as
 * it's written (explainer cards, email drafts, call transcripts), not structured JSON. No schema:
 * partial JSON mid-stream isn't readable, so this is reserved for free-text generation.
 */
export async function* streamText(opts: { system: string; prompt: string; maxTokens?: number; onChunk?: (chunk: string) => void }): AsyncGenerator<string> {
  // Retries cover stream *initiation* only (a transient 503/429/network blip before any tokens
  // arrive) — the same RETRYABLE check askForJson uses. Once a stream has started yielding
  // chunks a mid-stream failure isn't retried here, since re-running would duplicate whatever
  // was already emitted to onChunk/the orchestration bus.
  let stream: Awaited<ReturnType<typeof genai.models.generateContentStream>> | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      stream = await genai.models.generateContentStream({
        model: MODEL,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      break;
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE.test(String(err)) || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  if (!stream) throw lastErr;

  for await (const part of stream) {
    const text = part.text;
    if (!text) continue;
    opts.onChunk?.(text);
    yield text;
  }
}
