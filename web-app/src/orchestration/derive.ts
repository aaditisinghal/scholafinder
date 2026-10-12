import { AGENTS, type AgentId, type AgentLiveState, type OrchestrationEvent, type TenantInfo } from "./types";

const RECENT_PER_AGENT = 6;

function emptyState(): AgentLiveState {
  return { status: "idle", label: null, summary: null, ts: null, durationMs: null, runCount: 0, errorCount: 0, externalParty: null, source: [], recent: [], activeDispatchId: null };
}

/** events must be newest-first. Optionally scoped to one tenant ("all" = every tenant, aggregated). */
export function deriveAgentStates(events: OrchestrationEvent[], tenant: string): Record<AgentId, AgentLiveState> {
  const out = {} as Record<AgentId, AgentLiveState>;
  for (const a of AGENTS) out[a.id] = emptyState();

  const scoped = tenant === "all" ? events : events.filter((e) => e.tenant === tenant);

  // Walk oldest -> newest so counts accumulate correctly, but we want the state to reflect the
  // newest event per agent — simplest is two passes: counts from a forward scan, latest snapshot
  // from the first (newest) matching event per agent since `scoped` is newest-first.
  const seenLatest = new Set<AgentId>();
  for (const e of scoped) {
    if (!e.agent || !(e.agent in out)) continue;
    const cur = out[e.agent];
    cur.runCount += e.kind === "dispatch" ? 1 : 0;
    cur.errorCount += e.status === "error" ? 1 : 0;
    if (cur.recent.length < RECENT_PER_AGENT) cur.recent.push(e);
    if (!seenLatest.has(e.agent)) {
      seenLatest.add(e.agent);
      cur.status = e.kind === "dispatch" ? "running" : e.status;
      cur.label = e.label;
      cur.summary = e.summary;
      cur.ts = e.ts;
      cur.durationMs = e.durationMs ?? null;
      cur.externalParty = e.externalParty ?? null;
      cur.source = e.source;
      cur.activeDispatchId = e.kind === "dispatch" ? e.id : null;
    }
  }
  return out;
}

export function deriveTenants(events: OrchestrationEvent[]): TenantInfo[] {
  const map = new Map<string, TenantInfo>();
  for (const e of events) {
    if (e.tenant === "system") continue;
    const existing = map.get(e.tenant);
    if (existing) {
      existing.eventCount++;
      if (e.ts > existing.lastSeen) existing.lastSeen = e.ts;
    } else {
      map.set(e.tenant, { tenant: e.tenant, label: e.tenantLabel, lastSeen: e.ts, eventCount: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}
