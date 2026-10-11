import { forwardRef, type ReactNode } from "react";
import type { AgentLiveState, AgentMeta, SourceRef } from "./types";

function timeStr(ts: number | null): string {
  if (!ts) return "--:--:--";
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function sourceLine(s: SourceRef): string {
  const tag = { db: "DB", gcp: "GCP", url: "URL", api: "API" }[s.kind];
  return `[${tag}] ${s.label}`;
}

export const AgentBox = forwardRef<
  HTMLDivElement,
  { meta: AgentMeta; state: AgentLiveState; expanded: boolean; onToggle: () => void; size?: "sm" | "lg"; streamingText?: string; extra?: ReactNode }
>(({ meta, state, expanded, onToggle, size = "sm", streamingText, extra }, ref) => {
  const active = state.status === "running";
  const hasError = state.status === "error";
  const everRan = state.runCount > 0;
  const isStreaming = active && Boolean(streamingText);

  return (
    <div ref={ref} className={`abox abox-${size} ${active ? "active" : everRan ? "done" : "idle"} ${hasError ? "has-error" : ""} ${expanded ? "expanded" : ""}`}>
      <button className="abox-head" onClick={onToggle}>
        <span className="abox-title">
          <span className="abox-dot" />
          {meta.label}
        </span>
        <span className="abox-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      <div className="abox-status-line">{active ? (isStreaming ? "GENERATING…" : "RUNNING") : hasError ? "ERROR" : everRan ? "IDLE · LAST OK" : "IDLE · NEVER RUN"}</div>
      <div className="abox-function">{state.label ? `${state.label}${state.summary ? ` — ${state.summary}` : ""}` : "—"}</div>
      <div className="abox-meta-row">
        <span>{timeStr(state.ts)}</span>
        <span>{state.durationMs != null ? `${state.durationMs}ms` : ""}</span>
        <span>
          {state.runCount} run{state.runCount === 1 ? "" : "s"}
        </span>
      </div>
      {expanded && (
        <div className="abox-expand">
          {extra}
          {active && (
            <>
              <div className="abox-expand-label live">● LIVE OUTPUT</div>
              {streamingText ? (
                <div className="abox-stream-text">
                  {streamingText}
                  <span className="abox-caret">▋</span>
                </div>
              ) : (
                <div className="abox-processing">
                  processing<span className="abox-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </div>
              )}
            </>
          )}

          <div className="abox-expand-label" style={{ marginTop: active ? 10 : 0 }}>
            SOURCE / VERIFICATION
          </div>
          {state.source.length === 0 && <div className="abox-source-row dim">no source recorded yet</div>}
          {state.source.map((s, i) => (
            <div key={i} className="abox-source-row">
              └─ {sourceLine(s)}
            </div>
          ))}
          {state.externalParty && <div className="abox-source-row ext">└─ reaches: {state.externalParty}</div>}
          {state.recent.length > 0 && (
            <>
              <div className="abox-expand-label" style={{ marginTop: 8 }}>
                RECENT ({state.recent.length})
              </div>
              {state.recent.map((e) => (
                <div key={e.id} className={`abox-recent-row ${e.status}`}>
                  {timeStr(e.ts)} {e.kind === "dispatch" ? "→" : "←"} {e.summary || e.label}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
});
AgentBox.displayName = "AgentBox";
