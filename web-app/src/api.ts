import type { SwipeCardData, SwipeDecision } from "./types";

export async function fetchSwipeStack(studentId: string): Promise<SwipeCardData[]> {
  const res = await fetch(`/api/swipe-stack/${studentId}`);
  if (!res.ok) throw new Error(`Failed to load matches (${res.status})`);
  const data = await res.json();
  return data.cards as SwipeCardData[];
}

export async function postSwipe(studentId: string, universityId: string, decision: SwipeDecision): Promise<{ card?: string }> {
  const res = await fetch("/api/swipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, universityId, decision }),
  });
  if (!res.ok) throw new Error(`Failed to record swipe (${res.status})`);
  return res.json();
}
