import type { TenantInfo } from "./types";

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 2) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function SessionsPanel({ tenants, selected, onSelect }: { tenants: TenantInfo[]; selected: string; onSelect: (t: string) => void }) {
  return (
    <div className="sessions-panel">
      <div className="sessions-title">SESSIONS ({tenants.length})</div>
      <button className={`session-row ${selected === "all" ? "sel" : ""}`} onClick={() => onSelect("all")}>
        <span className="session-dot all" />
        <span className="session-label">ALL (multiplexed)</span>
      </button>
      {tenants.map((t) => (
        <button key={t.tenant} className={`session-row ${selected === t.tenant ? "sel" : ""}`} onClick={() => onSelect(t.tenant)}>
          <span className="session-dot" />
          <div className="session-info">
            <span className="session-label">{t.label}</span>
            <span className="session-sub">
              {t.eventCount} evt · {timeAgo(t.lastSeen)} ago
            </span>
          </div>
        </button>
      ))}
      {tenants.length === 0 && <div className="sessions-empty">no sessions yet — text the iMessage line</div>}
    </div>
  );
}
