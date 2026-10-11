import { useRef, useCallback } from "react";

/**
 * Synthesizes swipe sound effects with the Web Audio API instead of shipping audio
 * files — no assets to host, no licensing to worry about, loads instantly.
 */
export function useSwipeSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (freqStart: number, freqEnd: number, duration: number, type: OscillatorType = "sine") => {
      try {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctx.currentTime + duration);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
      } catch {
        // Audio is a nice-to-have; never let it break the swipe flow.
      }
    },
    [getCtx]
  );

  const playYes = useCallback(() => {
    playTone(520, 880, 0.18, "sine");
    setTimeout(() => playTone(880, 1200, 0.12, "sine"), 70);
  }, [playTone]);

  const playNo = useCallback(() => {
    playTone(320, 160, 0.16, "triangle");
  }, [playTone]);

  return { playYes, playNo };
}
