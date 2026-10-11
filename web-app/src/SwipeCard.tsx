import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { Suspense, forwardRef, useImperativeHandle } from "react";
import { PhotoPlane } from "./PhotoPlane";
import type { SwipeCardData, SwipeDecision } from "./types";

export interface SwipeCardHandle {
  swipe: (decision: "yes" | "no") => void;
}

export const SwipeCard = forwardRef<
  SwipeCardHandle,
  {
    data: SwipeCardData;
    active: boolean;
    stackDepth: number;
    onSwiped: (decision: SwipeDecision) => void;
  }
>(function SwipeCard({ data, active, stackDepth, onSwiped }, ref) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-22, 22]);
  const likeOpacity = useTransform(x, [20, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -20], [1, 0]);

  useImperativeHandle(ref, () => ({
    swipe(decision) {
      const target = decision === "yes" ? 600 : -600;
      animate(x, target, {
        duration: 0.35,
        ease: "easeIn",
        onComplete: () => onSwiped(decision),
      });
    },
  }));

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 120) {
      animate(x, 600, { duration: 0.3, ease: "easeIn", onComplete: () => onSwiped("yes") });
    } else if (info.offset.x < -120) {
      animate(x, -600, { duration: 0.3, ease: "easeIn", onComplete: () => onSwiped("no") });
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  const subParts = [data.worldRanking ? `#${data.worldRanking} world` : null, [data.city, data.state].filter(Boolean).join(", ") || null].filter(
    Boolean
  );

  return (
    <motion.div
      className="swipe-card"
      style={{ x, rotate, zIndex: 10 - stackDepth, scale: 1 - stackDepth * 0.04, top: stackDepth * 10 }}
      drag={active ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
    >
      <div className="photo-wrap">
        {data.photoUrl ? (
          <Suspense fallback={<div className="photo-fallback">{data.name.slice(0, 2).toUpperCase()}</div>}>
            <PhotoPlane url={data.photoUrl} dragX={x} />
          </Suspense>
        ) : (
          <div className="photo-fallback">{data.name.slice(0, 2).toUpperCase()}</div>
        )}
      </div>
      <div className="card-body">
        <p className="card-name">{data.name}</p>
        <p className="card-sub">{subParts.join(" · ")}</p>
        <div className="card-tags">
          {data.cultureTags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
        {data.matchReasons.length > 0 && <p className="card-reasons">{data.matchReasons.join(", ")}</p>}
        {data.eligibility && <p className="card-elig">{data.eligibility}</p>}
      </div>
      <motion.div className="stamp stamp-yes" style={{ opacity: likeOpacity }}>
        yes
      </motion.div>
      <motion.div className="stamp stamp-no" style={{ opacity: nopeOpacity }}>
        no
      </motion.div>
    </motion.div>
  );
});
