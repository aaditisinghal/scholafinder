import type { OrchestrationEvent } from "./types";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

const KIND_SIGIL: Record<OrchestrationEvent["kind"], string> = { inbound: "IN ", dispatch: "-->", result: "<--", log: " . ", stream: "~~~" };

export function EventLog({ events }: { events: OrchestrationEvent[] }) {
  return (
    <div className="term-log">
      <div className="term-log-prompt">scholafinder@orchestrator:~$ tail -f events.log</div>
      {events.length === 0 && <div className="term-log-empty">waiting for activity…</div>}
      {events.map((e) => (
        <div key={e.id} className={`term-log-row ${e.status}`}>
          <span className="term-log-time">{fmtTime(e.ts)}</span>
          <span className="term-log-kind">{KIND_SIGIL[e.kind]}</span>
          <span className="term-log-tenant">[{e.tenantLabel}]</span>
          <span className="term-log-path">
            {e.from}→{e.to}
          </span>
          <span className="term-log-label">{e.label}:</span>
          <span className="term-log-summary">{e.summary}</span>
          {e.durationMs != null && <span className="term-log-duration">{e.durationMs}ms</span>}
        </div>
      ))}
    </div>
  );
}
