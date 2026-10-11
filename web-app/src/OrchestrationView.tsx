import { useMemo, useState } from "react";
import { WireDiagram } from "./orchestration/WireDiagram";
import { SessionsPanel } from "./orchestration/SessionsPanel";
import { EventLog } from "./orchestration/EventLog";
import { useOrchestrationStream } from "./orchestration/useOrchestrationStream";
import { deriveAgentStates, deriveTenants } from "./orchestration/derive";
import { MOCK_EVENTS, MOCK_IMESSAGE_CONVERSATION } from "./orchestration/mockData";
import type { AgentId } from "./orchestration/types";
import "./orchestration/orchestration.css";

export function OrchestrationView() {
  const { connected, events: liveEvents, pulses, streamBuffers } = useOrchestrationStream();
  const [selectedTenant, setSelectedTenant] = useState("all");
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Placeholder activity fills every box so the full design is visible before any real run —
  // real events are always newer, so they win in the newest-first derive scan and this fades out.
  const events = useMemo(() => [...liveEvents, ...MOCK_EVENTS].sort((a, b) => b.ts - a.ts), [liveEvents]);

  const tenants = useMemo(() => deriveTenants(events), [events]);
  const agentStates = useMemo(() => deriveAgentStates(events, selectedTenant), [events, selectedTenant]);
  const scopedPulses = useMemo(() => (selectedTenant === "all" ? pulses : pulses.filter((p) => p.tenant === selectedTenant)), [pulses, selectedTenant]);
  const scopedEvents = useMemo(() => (selectedTenant === "all" ? events : events.filter((e) => e.tenant === selectedTenant)), [events, selectedTenant]);

  const externalParties = useMemo(() => {
    const out: { key: string; name: string; fromAgent: AgentId }[] = [];
    const seen = new Set<string>();
    (["call", "email"] as AgentId[]).forEach((agentId) => {
      const state = agentStates[agentId];
      if (state?.externalParty && state.status !== "idle") {
        const key = `${agentId}:${state.externalParty}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ key, name: state.externalParty, fromAgent: agentId });
        }
      }
    });
    return out;
  }, [agentStates]);

  async function runDemo() {
    setDemoRunning(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/orchestration/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Demo flow failed to start");
    } catch (err) {
      setDemoError((err as Error).message);
    } finally {
      setTimeout(() => setDemoRunning(false), 4000);
    }
  }

  return (
    <div className="term-root">
      <header className="term-header">
        <div className="term-header-left">
          <span className="term-prompt">scholafinder@orchestrator</span>
          <span className="term-cursor">_</span>
        </div>
        <div className="term-header-right">
          {demoError && <span className="term-error-text">{demoError}</span>}
          <button className="term-btn" onClick={runDemo} disabled={demoRunning}>
            {demoRunning ? "RUNNING…" : "./run-demo-flow.sh"}
          </button>
          <span className={`term-conn ${connected ? "on" : "off"}`}>{connected ? "● LIVE" : "○ CONNECTING"}</span>
        </div>
      </header>

      <div className="term-body">
        <SessionsPanel tenants={tenants} selected={selectedTenant} onSelect={setSelectedTenant} />

        <div className="term-main">
          <WireDiagram agentStates={agentStates} pulses={scopedPulses} externalParties={externalParties} streamBuffers={streamBuffers} imessageConversation={MOCK_IMESSAGE_CONVERSATION} />
          <EventLog events={scopedEvents} />
        </div>
      </div>
    </div>
  );
}
