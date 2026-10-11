import { useEffect, useRef, useState } from "react";
import { SHOWCASE_CALL, SHOWCASE_UNIVERSITY } from "./showcaseCall";

export function CallPlayback() {
  const [open, setOpen] = useState(false);
  const [turnIndex, setTurnIndex] = useState(-1); // -1 = not started
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false); // true only once the final turn has actually finished playing
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    const onEnded = () => {
      setTurnIndex((i) => {
        const next = i + 1;
        if (next >= SHOWCASE_CALL.length) {
          setPlaying(false);
          setEnded(true);
          return i;
        }
        return next;
      });
    };
    const onError = () => console.error("[CallPlayback] audio element error", audio.error, audio.src);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (!playing || turnIndex < 0) return;
    const audio = audioRef.current!;
    audio.src = SHOWCASE_CALL[turnIndex].audio;
    audio.play().catch((err) => {
      console.error("[CallPlayback] play() failed for turn", turnIndex, SHOWCASE_CALL[turnIndex].audio, err);
      setPlaying(false);
    });
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turnIndex, playing]);

  function start() {
    setOpen(true);
    setEnded(false);
    setTurnIndex(0);
    setPlaying(true);
  }

  function pause() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  function resume() {
    if (turnIndex < 0 || ended) {
      start();
      return;
    }
    const audio = audioRef.current!;
    // Defensive: if audio.src ever drifts from the turn we think we're on (e.g. after an
    // interrupted play() call), re-sync it before resuming instead of trusting stale state.
    if (!audio.src.endsWith(SHOWCASE_CALL[turnIndex].audio)) {
      audio.src = SHOWCASE_CALL[turnIndex].audio;
    }
    setPlaying(true);
    audio.play().catch((err) => {
      console.error("[CallPlayback] resume play() failed for turn", turnIndex, err);
      setPlaying(false);
    });
  }

  function restart() {
    audioRef.current?.pause();
    setEnded(false);
    setTurnIndex(0);
    setPlaying(true);
  }

  return (
    <div className="call-playback-wrap">
      <button className="call-entry" onClick={() => (open ? pause() : start())}>
        <span className="call-entry-dot" />
        <span className="call-entry-text">ONGOING CALL — {SHOWCASE_UNIVERSITY} Admissions</span>
        <span className="call-entry-action">{open ? (playing ? "⏸" : "▶") : "▶ listen"}</span>
      </button>

      {open && (
        <div className="call-panel">
          <div className="call-panel-head">
            <span className="call-panel-label">● LIVE CALL (ElevenLabs — hardcoded sample)</span>
            <div className="call-controls">
              {playing ? (
                <button className="call-ctrl-btn" onClick={pause}>⏸ pause</button>
              ) : (
                <button className="call-ctrl-btn" onClick={resume}>{ended ? "▶ replay" : "▶ resume"}</button>
              )}
              {ended && <button className="call-ctrl-btn" onClick={restart}>↺ restart</button>}
            </div>
          </div>
          <div className="call-transcript">
            {SHOWCASE_CALL.map((turn, i) => (
              <div
                key={i}
                ref={i === turnIndex ? activeRowRef : undefined}
                className={`call-bubble-row ${turn.speaker} ${i === turnIndex ? (playing ? "speaking" : "last") : ""} ${i < turnIndex ? "done" : ""}`}
              >
                <div className="call-bubble-label">{turn.speaker === "caller" ? "SCHOLARFINDER AI" : "ADMISSIONS OFFICER"}</div>
                <div className="call-bubble">{turn.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
