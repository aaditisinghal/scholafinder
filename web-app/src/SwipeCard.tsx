import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { forwardRef, useImperativeHandle, useState } from "react";
import type { SwipeCardData, SwipeDecision } from "./types";

export interface SwipeCardHandle {
  swipe: (decision: "yes" | "no") => void;
}

const SETTING_LABEL: Record<string, string> = { urban: "Urban", suburban: "Suburban", rural: "Rural" };
const TEST_POLICY_LABEL: Record<string, string> = { required: "Test required", optional: "Test-optional", not_accepted: "No test scores" };
const AID_TYPE_LABEL: Record<string, string> = {
  full_ride: "Full ride",
  full_need_based: "Full need-based aid",
  full_tuition: "Full tuition",
  partial: "Partial aid",
  merit_partial: "Merit aid",
  none_mentioned: "Aid unclear",
};

function formatUsd(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "$0";
  return `$${Math.round(n).toLocaleString()}`;
}

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const imageTilt = useTransform(x, [-300, 300], [4, -4]);
  const likeOpacity = useTransform(x, [20, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -20], [1, 0]);
  const [imgFailed, setImgFailed] = useState(false);

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

  const locationLine = [data.city, data.state].filter(Boolean).join(", ");
  const deadline = formatDeadline(data.deadlineRd) ?? formatDeadline(data.deadlineEd);
  const tuition = formatUsd(data.estimatedCostOfAttendanceUsd);
  const appFee = data.applicationFeeUsd != null ? (data.applicationFeeUsd === 0 ? "No fee" : formatUsd(data.applicationFeeUsd)) : null;

  const facts: { label: string; value: string }[] = [];
  if (data.setting) facts.push({ label: "Setting", value: SETTING_LABEL[data.setting] });
  if (data.testPolicy) facts.push({ label: "Testing", value: TEST_POLICY_LABEL[data.testPolicy] ?? data.testPolicy });
  if (tuition) facts.push({ label: "Est. cost", value: tuition });
  if (deadline) facts.push({ label: "RD deadline", value: deadline });
  if (appFee) facts.push({ label: "App fee", value: appFee });

  return (
    <motion.div
      className="swipe-card"
      style={{ x, rotate, zIndex: 10 - stackDepth, scale: 1 - stackDepth * 0.04, top: stackDepth * 10 }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 - stackDepth * 0.04 }}
      transition={{ duration: 0.25 }}
      drag={active ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
    >
      <div className="photo-wrap">
        {data.photoUrl && !imgFailed ? (
          <motion.img
            className="photo-img"
            src={data.photoUrl}
            alt=""
            style={{ rotate: imageTilt, scale: 1.08 }}
            onError={() => setImgFailed(true)}
            draggable={false}
          />
        ) : (
          <div className="photo-fallback">{data.name.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="photo-gradient" />
        <div className="photo-badge-row">
          <span className="badge badge-score">{Math.round(data.matchScore)}% match</span>
          {data.factsStatus === "confirmed" && <span className="badge badge-verified">✓ Verified source</span>}
          {data.factsStatus === "conflicting" && <span className="badge badge-conflict">⚠ Sources conflict</span>}
        </div>
      </div>
      <div className="card-body">
        <p className="card-name">{data.name}</p>
        <p className="card-sub">
          {[data.worldRanking ? `#${data.worldRanking} world` : null, locationLine || null].filter(Boolean).join(" · ")}
        </p>
        <div className="card-tags">
          {data.aidType && <span className="tag tag-aid">{AID_TYPE_LABEL[data.aidType] ?? data.aidType.replace(/_/g, " ")}</span>}
          {data.cultureTags.map((t) => (
            <span key={t} className="tag">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
        {facts.length > 0 && (
          <div className="fact-grid">
            {facts.map((f) => (
              <div className="fact-cell" key={f.label}>
                <span className="fact-label">{f.label}</span>
                <span className="fact-value">{f.value}</span>
              </div>
            ))}
          </div>
        )}
        {data.matchReasons.length > 0 && <p className="card-reasons">{data.matchReasons.join(" · ")}</p>}
        {(data.admissionsEmail || data.admissionsPhone) && (
          <p className="card-contact">
            International Admissions Office
            {data.admissionsEmail ? ` · ${data.admissionsEmail}` : ""}
          </p>
        )}
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
