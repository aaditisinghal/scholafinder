import { useEffect, useRef, useState } from "react";
import type { OrchestrationEvent } from "./types";

const LOG_LIMIT = 300;
const STREAM_BUFFER_LIMIT = 40; // oldest finished streams get dropped, not the active one

export interface Pulse {
  id: string;
  from: OrchestrationEvent["from"];
  to: OrchestrationEvent["to"];
  status: OrchestrationEvent["status"];
  kind: OrchestrationEvent["kind"];
  tenant: string;
}

export function useOrchestrationStream() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<OrchestrationEvent[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [streamBuffers, setStreamBuffers] = useState<Record<string, string>>({});
  const pulseTimers = useRef<number[]>([]);
  const bufferOrder = useRef<string[]>([]);

  useEffect(() => {
    const source = new EventSource("/api/orchestration/stream");

    const pushPulse = (e: OrchestrationEvent) => {
      if (e.kind !== "dispatch" && e.kind !== "result") return;
      const pulseId = e.id;
      setPulses((prev) => [...prev, { id: pulseId, from: e.from, to: e.to, status: e.status, kind: e.kind, tenant: e.tenant }]);
      const timer = window.setTimeout(() => setPulses((prev) => prev.filter((p) => p.id !== pulseId)), 1600);
      pulseTimers.current.push(timer);
    };

    source.addEventListener("history", (ev) => {
      const history = JSON.parse((ev as MessageEvent).data) as OrchestrationEvent[];
      setEvents(history.slice().reverse().slice(0, LOG_LIMIT));
      setConnected(true);
    });

    source.addEventListener("event", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as OrchestrationEvent;

      if (e.kind === "stream") {
        const id = e.dispatchId;
        if (!id) return;
        setStreamBuffers((prev) => {
          const next = { ...prev, [id]: (prev[id] ?? "") + e.chunk };
          if (!(id in prev)) bufferOrder.current.push(id);
          while (bufferOrder.current.length > STREAM_BUFFER_LIMIT) {
            const dropped = bufferOrder.current.shift();
            if (dropped && dropped !== id) delete next[dropped];
          }
          return next;
        });
        return;
      }

      setEvents((prev) => [e, ...prev].slice(0, LOG_LIMIT));
      pushPulse(e);
    });

    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);

    return () => {
      source.close();
      // Safe despite the lint rule's generic warning: pulseTimers is a hook-level ref (not a
      // per-render DOM node), and this effect only runs once — we want the *live* accumulated
      // timer list at unmount time, not a snapshot from mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pulseTimers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return { connected, events, pulses, streamBuffers };
}
