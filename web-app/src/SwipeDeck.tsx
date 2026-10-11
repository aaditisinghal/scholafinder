import { useEffect, useRef, useState } from "react";
import { fetchSwipeStack, postSwipe } from "./api";
import { SwipeCard, type SwipeCardHandle } from "./SwipeCard";
import { RevealModal } from "./RevealModal";
import { useSwipeSound } from "./useSwipeSound";
import type { SwipeCardData, SwipeDecision } from "./types";

type LoadState = "loading" | "ready" | "error";

export function SwipeDeck({ studentId }: { studentId: string }) {
  const [cards, setCards] = useState<SwipeCardData[]>([]);
  const [current, setCurrent] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reveal, setReveal] = useState<string | null>(null);
  const topCardRef = useRef<SwipeCardHandle>(null);
  const { playYes, playNo } = useSwipeSound();

  useEffect(() => {
    fetchSwipeStack(studentId)
      .then((data) => {
        setCards(data);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [studentId]);

  async function handleSwiped(decision: SwipeDecision) {
    const university = cards[current];
    if (decision === "yes") playYes();
    else playNo();

    setCurrent((i) => i + 1);

    try {
      const result = await postSwipe(studentId, university.id, decision);
      if (decision === "yes" && result.card) setReveal(result.card);
    } catch {
      // Swipe stays recorded client-side as "moved past" even if the write failed —
      // better than freezing the deck on a flaky network blip.
    }
  }

  if (loadState === "loading") {
    return <div className="state-message">Finding your matches…</div>;
  }
  if (loadState === "error") {
    return <div className="state-message">Couldn't load your matches. Reopen this link from iMessage.</div>;
  }

  const remaining = cards.slice(current, current + 3);
  const isDone = current >= cards.length;

  return (
    <div className="deck-shell">
      {!isDone && (
        <p className="deck-progress">
          {current + 1} / {cards.length}
        </p>
      )}
      <div className="stack">
        {isDone ? (
          <div className="state-message empty-state">
            That's everyone who matched.
            <br />
            Check iMessage — I'll keep you posted on deadlines and outreach.
          </div>
        ) : (
          remaining.map((card, i) => (
            <SwipeCard
              key={card.id}
              ref={i === 0 ? topCardRef : null}
              data={card}
              active={i === 0}
              stackDepth={i}
              onSwiped={handleSwiped}
            />
          ))
        )}
      </div>
      {!isDone && (
        <div className="controls">
          <button className="control-btn no" aria-label="No" onClick={() => topCardRef.current?.swipe("no")}>
            ✕
          </button>
          <button className="control-btn yes" aria-label="Yes" onClick={() => topCardRef.current?.swipe("yes")}>
            ♥
          </button>
        </div>
      )}
      <RevealModal text={reveal} onContinue={() => setReveal(null)} />
    </div>
  );
}
