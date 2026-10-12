/**
 * Live orchestration event bus. Every place the boss agent dispatches to a subagent (or a
 * subagent reports back) calls runAgent() here, which emits a start + end event carrying
 * exactly where its output came from (a DB table/row, a scraped URL, or a Vertex AI/GCP model
 * call) — so the frontend can show provenance per action instead of asking the viewer to trust
 * it. The frontend orchestration view subscribes over SSE (see src/web/server.ts).
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type AgentId =
  | "boss"
  | "browser"
  | "call"
  | "email"
  | "reconciliation"
  | "truecost"
  | "requirements"
  | "profilematch"
  | "explainer"
  | "needaware"
  | "policymonitor"
  | "deadline"
  | "reward";

export type NodeId = AgentId | "imessage" | "web";

export interface SourceRef {
  kind: "db" | "gcp" | "url" | "api";
  label: string;
}

export interface OrchestrationEvent {
  id: string;
  ts: number;
  kind: "inbound" | "dispatch" | "result" | "log" | "stream";
  from: NodeId;
  to: NodeId;
  agent: AgentId;
  label: string;
  summary: string;
  status: "running" | "success" | "error";
  durationMs?: number;
  dispatchId?: string; // links a 'result' (or 'stream' chunk) back to the 'dispatch' it answers
  tenant: string; // student identifier this action is working on behalf of ("system" for none)
  tenantLabel: string; // display label, e.g. "+1404…2619" or "demo"
  externalParty?: string; // set when this action reaches an outside party (e.g. "Harvard Admissions Office")
  source: SourceRef[]; // where the data/output came from — never empty for a 'result' event
  chunk?: string; // present for kind:"stream" — a raw text token/chunk as the model generates it
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

const HISTORY_LIMIT = 300;
const history: OrchestrationEvent[] = [];

export function recordEvent(e: Omit<OrchestrationEvent, "id" | "ts" | "source" | "tenant" | "tenantLabel"> & Partial<Pick<OrchestrationEvent, "source" | "tenant" | "tenantLabel">>): OrchestrationEvent {
  const full: OrchestrationEvent = {
    ...e,
    id: randomUUID(),
    ts: Date.now(),
    source: e.source ?? [],
    tenant: e.tenant ?? "system",
    tenantLabel: e.tenantLabel ?? e.tenant ?? "system",
  };
  history.push(full);
  if (history.length > HISTORY_LIMIT) history.shift();
  emitter.emit("event", full);
  return full;
}

export function getHistory(): OrchestrationEvent[] {
  return [...history];
}

export function subscribe(fn: (e: OrchestrationEvent) => void): () => void {
  emitter.on("event", fn);
  return () => emitter.off("event", fn);
}

/**
 * Live token/chunk from a streaming model call, tied to the dispatch it belongs to. Not pushed
 * to `history` (would flood the terminal log) — only live SSE subscribers see these, which is
 * exactly what the expanded agent box's "responding and generating" view needs.
 */
export function emitStreamChunk(dispatchId: string, agent: AgentId, tenant: string, tenantLabel: string, chunk: string): void {
  const full: OrchestrationEvent = {
    id: randomUUID(),
    ts: Date.now(),
    kind: "stream",
    from: agent,
    to: agent,
    agent,
    label: "",
    summary: "",
    status: "running",
    dispatchId,
    tenant,
    tenantLabel,
    source: [],
    chunk,
  };
  emitter.emit("event", full);
}

export interface RunAgentOptions<T> {
  from?: NodeId;
  tenant?: string;
  tenantLabel?: string;
  externalParty?: string;
  /** Sources the dispatch itself drew on (e.g. "preferences" row read before calling out). */
  dispatchSource?: SourceRef[];
  /** Sources the result is grounded in — always shown, this is the non-hallucination trail. */
  resultSource: (result: T) => SourceRef[];
}

/**
 * Wraps one subagent invocation: emits a 'dispatch' (boss -> agent) immediately, runs fn(),
 * then emits a 'result' (agent -> boss) with success/error, timing, and provenance.
 */
export async function runAgent<T>(
  agent: AgentId,
  label: string,
  inputSummary: string,
  fn: (dispatchId: string) => Promise<T>,
  summarizeResult: (result: T) => string,
  opts: RunAgentOptions<T>
): Promise<T> {
  const from = opts.from ?? "boss";
  const dispatch = recordEvent({
    kind: "dispatch",
    from,
    to: agent,
    agent,
    label,
    summary: inputSummary,
    status: "running",
    tenant: opts.tenant,
    tenantLabel: opts.tenantLabel,
    externalParty: opts.externalParty,
    source: opts.dispatchSource,
  });
  const start = Date.now();
  try {
    const result = await fn(dispatch.id);
    recordEvent({
      kind: "result",
      from: agent,
      to: from,
      agent,
      label,
      summary: summarizeResult(result),
      status: "success",
      durationMs: Date.now() - start,
      dispatchId: dispatch.id,
      tenant: opts.tenant,
      tenantLabel: opts.tenantLabel,
      externalParty: opts.externalParty,
      source: opts.resultSource(result),
    });
    return result;
  } catch (err) {
    recordEvent({
      kind: "result",
      from: agent,
      to: from,
      agent,
      label,
      summary: (err as Error).message,
      status: "error",
      durationMs: Date.now() - start,
      dispatchId: dispatch.id,
      tenant: opts.tenant,
      tenantLabel: opts.tenantLabel,
      externalParty: opts.externalParty,
      source: [],
    });
    throw err;
  }
}
