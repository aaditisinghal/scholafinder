export interface StudentPreferences {
  culture?: "startup" | "corporate" | "liberal_arts" | "research" | "arts";
  setting?: "urban" | "suburban" | "rural";
  aidType?: "full_ride" | "full_tuition" | "partial" | "any";
  minWorldRanking?: number;
  maxWorldRanking?: number;
  subject?: string;
  subjectRankingMax?: number;
  satScore?: number;
  ieltsScore?: number;
  notes?: string;
}

export interface University {
  id: string;
  name: string;
  country: string;
  city: string | null;
  state: string | null;
  setting: string | null;
  culture_tags: string[] | null;
  world_ranking: number | null;
  aid_site_url: string | null;
  admissions_email: string | null;
  admissions_phone: string | null;
  photo_url: string | null;
}

export interface FactCandidate {
  university_id: string;
  fact_key: string;
  fact_value: string;
  source_agent: "browser" | "call" | "email" | "seed";
  provenance_url: string | null;
  confidence: number;
  observed_at: string;
}

export interface ReconciledFact {
  university_id: string;
  fact_key: string;
  fact_value: string;
  confidence: number;
  status: "confirmed" | "conflicting" | "stale";
  provenance: Array<{ source_agent: string; url: string | null; value: string; observed_at: string }>;
}
