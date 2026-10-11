export interface SwipeCardData {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  worldRanking: number | null;
  cultureTags: string[];
  photoUrl: string | null;
  matchReasons: string[];
  eligibility: string | null;
}

export type SwipeDecision = "yes" | "no" | "skip";
