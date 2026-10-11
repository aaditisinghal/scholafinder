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
  dispatchId?: string;
  tenant: string;
  tenantLabel: string;
  externalParty?: string;
  source: SourceRef[];
  chunk?: string;
}

export type AgentGroup = "boss" | "gatherer" | "resolver" | "monitor" | "reward";

export interface AgentMeta {
  id: AgentId;
  label: string;
  group: AgentGroup;
}

export const AGENTS: AgentMeta[] = [
  { id: "boss", label: "BOSS AGENT", group: "boss" },
  { id: "browser", label: "BROWSER GATHERER", group: "gatherer" },
  { id: "call", label: "CALL GATHERER", group: "gatherer" },
  { id: "email", label: "EMAIL GATHERER", group: "gatherer" },
  { id: "reconciliation", label: "RECONCILIATION", group: "resolver" },
  { id: "truecost", label: "TRUE-COST", group: "resolver" },
  { id: "requirements", label: "REQUIREMENTS/PACKET", group: "resolver" },
  { id: "profilematch", label: "PROFILE-MATCH", group: "resolver" },
  { id: "explainer", label: "EXPLAINER", group: "resolver" },
  { id: "needaware", label: "NEED-AWARE FLAG", group: "resolver" },
  { id: "policymonitor", label: "POLICY-MONITOR", group: "monitor" },
  { id: "deadline", label: "DEADLINE", group: "monitor" },
  { id: "reward", label: "SOLANA REWARD", group: "reward" },
];

export interface AgentLiveState {
  status: "idle" | "running" | "success" | "error";
  label: string | null;
  summary: string | null;
  ts: number | null;
  durationMs: number | null;
  runCount: number;
  errorCount: number;
  externalParty: string | null;
  source: SourceRef[];
  recent: OrchestrationEvent[];
  activeDispatchId: string | null; // set while status === "running" — key into the streamBuffers map
}

export interface TenantInfo {
  tenant: string;
  label: string;
  lastSeen: number;
  eventCount: number;
}
