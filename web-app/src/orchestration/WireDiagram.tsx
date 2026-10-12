import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AGENTS, type AgentGroup, type AgentId, type AgentLiveState, type NodeId } from "./types";
import { AgentBox } from "./AgentBox";
import type { Pulse } from "./useOrchestrationStream";
import type { MockMessage } from "./mockData";

function timeAgoStr(minutesAgo: number): string {
  if (minutesAgo < 1) return "just now";
  return `${minutesAgo}m ago`;
}

const GROUP_ORDER: AgentGroup[] = ["gatherer", "resolver", "monitor", "reward"];
const GROUP_TITLE: Record<AgentGroup, string> = { boss: "BOSS", gatherer: "GATHERERS", resolver: "RESOLVERS", monitor: "MONITORS", reward: "REWARD" };

interface Point {
  x: number;
  y: number;
}

function anchorTop(rect: DOMRect, container: DOMRect): Point {
  return { x: rect.left - container.left + rect.width / 2, y: rect.top - container.top };
}
function anchorBottom(rect: DOMRect, container: DOMRect): Point {
  return { x: rect.left - container.left + rect.width / 2, y: rect.bottom - container.top };
}

export function WireDiagram({
  agentStates,
  pulses,
  externalParties,
  streamBuffers,
  imessageConversation,
}: {
  agentStates: Record<AgentId, AgentLiveState>;
  pulses: Pulse[];
  externalParties: { key: string; name: string; fromAgent: AgentId }[];
  streamBuffers: Record<string, string>;
  imessageConversation: MockMessage[];
}) {
  const [expanded, setExpanded] = useState<Set<NodeId>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Partial<Record<NodeId, HTMLDivElement | null>>>({});
  const extRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [edges, setEdges] = useState<{ key: string; from: Point; to: Point; active: boolean; status: string }[]>([]);
  const [, forceTick] = useState(0);

  const toggle = (id: NodeId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const byGroup = useMemo(() => {
    const m: Record<AgentGroup, typeof AGENTS> = { boss: [], gatherer: [], resolver: [], monitor: [], reward: [] };
    for (const a of AGENTS) m[a.group].push(a);
    return m;
  }, []);

  useLayoutEffect(() => {
    const recompute = () => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const bossEl = boxRefs.current.boss;
      if (!bossEl) return;
      const bossRect = bossEl.getBoundingClientRect();
      const nextEdges: typeof edges = [];

      for (const a of AGENTS) {
        if (a.id === "boss") continue;
        const el = boxRefs.current[a.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const state = agentStates[a.id];
        nextEdges.push({
          key: `boss-${a.id}`,
          from: anchorBottom(bossRect, cRect),
          to: anchorTop(rect, cRect),
          active: (state?.runCount ?? 0) > 0,
          status: state?.status ?? "idle",
        });
      }

      const imEl = boxRefs.current.imessage;
      if (imEl) nextEdges.push({ key: "imessage-boss", from: anchorBottom(imEl.getBoundingClientRect(), cRect), to: anchorTop(bossRect, cRect), active: true, status: "idle" });
      const webEl = boxRefs.current.web;
      if (webEl) nextEdges.push({ key: "web-boss", from: anchorBottom(webEl.getBoundingClientRect(), cRect), to: anchorTop(bossRect, cRect), active: true, status: "idle" });

      for (const ext of externalParties) {
        const fromEl = boxRefs.current[ext.fromAgent];
        const toEl = extRefs.current[ext.key];
        if (!fromEl || !toEl) continue;
        nextEdges.push({
          key: `ext-${ext.key}`,
          from: anchorBottom(fromEl.getBoundingClientRect(), cRect),
          to: anchorTop(toEl.getBoundingClientRect(), cRect),
          active: true,
          status: agentStates[ext.fromAgent]?.status ?? "running",
        });
      }

      setEdges(nextEdges);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    const interval = window.setInterval(() => forceTick((t) => t + 1), 1000); // catches box growth/shrink from expand toggles + content changes
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentStates, expanded, externalParties]);

  const svgSize = containerRef.current ? { w: containerRef.current.scrollWidth, h: containerRef.current.scrollHeight } : { w: 0, h: 0 };

  return (
    <div className="wire-canvas" ref={containerRef}>
      <svg className="wire-svg" width={svgSize.w} height={svgSize.h}>
        <defs>
          <filter id="pulse-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {edges.map((e) => (
          <g key={e.key}>
            <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} className={`wire-edge ${e.active ? "active" : ""} ${e.status}`} />
          </g>
        ))}
        {pulses.map((p) => {
          const edge = edges.find((e) => e.key === `boss-${p.to}` || e.key === `boss-${p.from}` || e.key === `${p.from}-${p.to}`);
          if (!edge) return null;
          const forward = p.kind === "dispatch";
          const x1 = forward ? edge.from.x : edge.to.x;
          const y1 = forward ? edge.from.y : edge.to.y;
          const x2 = forward ? edge.to.x : edge.from.x;
          const y2 = forward ? edge.to.y : edge.from.y;
          const color = p.status === "error" ? "#ff5f56" : forward ? "#ffffff" : "#5fff8f";
          return (
            <circle key={p.id} r={5.5} fill={color} filter="url(#pulse-glow)">
              <animate attributeName="cx" from={x1} to={x2} dur="1.4s" fill="freeze" />
              <animate attributeName="cy" from={y1} to={y2} dur="1.4s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="1.4s" fill="freeze" />
            </circle>
          );
        })}
      </svg>

      <div className="wire-sources-row">
        <div className={`abox abox-plain abox-clickable ${expanded.has("imessage") ? "expanded" : ""}`} ref={(el) => { boxRefs.current.imessage = el; }}>
          <button className="abox-head" onClick={() => toggle("imessage")}>
            <span className="abox-title">
              <span className="abox-dot always-on" />
              IMESSAGE
            </span>
            <span className="abox-chevron">{expanded.has("imessage") ? "▾" : "▸"}</span>
          </button>
          <div className="abox-status-line">student's phone · Spectrum (Photon)</div>
          {expanded.has("imessage") && (
            <div className="abox-expand">
              <div className="abox-expand-label">ONGOING CONVERSATION</div>
              <div className="imsg-thread">
                {imessageConversation.map((m, i) => (
                  <div key={i} className={`imsg-row ${m.from}`}>
                    <div className="imsg-bubble">{m.text}</div>
                    <div className="imsg-meta">
                      {m.from === "student" ? "student" : "boss agent"} · {timeAgoStr(m.minutesAgo)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="abox-source-row dim" style={{ marginTop: 6 }}>
                └─ placeholder thread — replaced by the real conversation once a student texts in
              </div>
            </div>
          )}
        </div>
        <div className={`abox abox-plain abox-clickable ${expanded.has("web") ? "expanded" : ""}`} ref={(el) => { boxRefs.current.web = el; }}>
          <button className="abox-head" onClick={() => toggle("web")}>
            <span className="abox-title">
              <span className="abox-dot always-on" />
              WEB SWIPE DECK
            </span>
            <span className="abox-chevron">{expanded.has("web") ? "▾" : "▸"}</span>
          </button>
          <div className="abox-status-line">tinder-style UI · web-app</div>
          {expanded.has("web") && (
            <div className="abox-expand">
              <div className="abox-expand-label">RECENT SWIPES</div>
              <div className="abox-source-row">└─ Harvard University — YES · 15m ago</div>
              <div className="abox-source-row">└─ Amherst College — YES · 27m ago</div>
              <div className="abox-source-row">└─ Georgetown University — NO · 31m ago</div>
              <div className="abox-source-row dim" style={{ marginTop: 6 }}>
                └─ placeholder — replaced by real swipe_decision calls from web-app/
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wire-boss-row">
        <AgentBox
          meta={AGENTS[0]}
          state={agentStates.boss}
          expanded={expanded.has("boss")}
          onToggle={() => toggle("boss")}
          size="lg"
          streamingText={agentStates.boss.activeDispatchId ? streamBuffers[agentStates.boss.activeDispatchId] : undefined}
          ref={(el) => { boxRefs.current.boss = el; }}
        />
      </div>

      <div className="wire-columns-row">
        {GROUP_ORDER.map((g) => (
          <div className="wire-col" key={g}>
            <div className="wire-col-title">{GROUP_TITLE[g]}</div>
            {byGroup[g].map((a) => {
              const state = agentStates[a.id];
              return (
                <AgentBox
                  key={a.id}
                  meta={a}
                  state={state}
                  expanded={expanded.has(a.id)}
                  onToggle={() => toggle(a.id)}
                  streamingText={state.activeDispatchId ? streamBuffers[state.activeDispatchId] : undefined}
                  ref={(el) => { boxRefs.current[a.id] = el; }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {externalParties.length > 0 && (
        <div className="wire-external-row">
          {externalParties.map((ext) => (
            <div className="abox abox-plain abox-external" key={ext.key} ref={(el) => { extRefs.current[ext.key] = el; }}>
              <div className="abox-title">
                <span className="abox-dot always-on" />
                {ext.name.toUpperCase()}
              </div>
              <div className="abox-status-line">external party · reached by {ext.fromAgent}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
