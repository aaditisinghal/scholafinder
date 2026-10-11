export interface SwipeCardData {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  setting: "urban" | "suburban" | "rural" | null;
  worldRanking: number | null;
  cultureTags: string[];
  photoUrl: string | null;
  matchReasons: string[];
  matchScore: number;
  admissionsEmail: string | null;
  admissionsPhone: string | null;
  aidSiteUrl: string | null;
  // from cardDetails (src/boss/swipe.ts)
  eligibility: string | null;
  internationalEligible: "yes" | "no" | "unclear";
  aidType: string | null;
  needAware: boolean | null;
  factsStatus: "confirmed" | "conflicting" | "missing";
  deadlineEd: string | null;
  deadlineRd: string | null;
  testPolicy: "required" | "optional" | "not_accepted" | null;
  applicationFeeUsd: number | null;
  feeWaiverAvailable: boolean | null;
  estimatedCostOfAttendanceUsd: number | null;
}

export type SwipeDecision = "yes" | "no" | "skip";
