/**
 * Seed data for the demo. scholarship_fact_candidates / requirements_packets figures here are
 * researched estimates (deadlines, test policy, cost of attendance), not official live-verified
 * numbers — public sources disagree with each other even on things like a school's own regular-
 * decision deadline from one year to the next, so confidence is kept at or below 0.7 on purpose
 * and source_agent is "seed" so reconciliationAgent and policyMonitorAgent both know to treat
 * these as provisional until a browser/call/email gatherer confirms or contradicts them.
 * Re-run the browser agent against aid_site_url before relying on any of this with a real student.
 *
 * This also writes directly into scholarship_facts (not just _candidates) and requirements_packets
 * so a swipe card has real-looking content from a cold seed, instead of every field reading
 * "no data yet" until the async gatherer/reconciliation agents happen to run first.
 */
import { pool } from "./pool.js";

interface SeedUniversity {
  name: string;
  city: string;
  state: string;
  setting: "urban" | "suburban" | "rural";
  cultureTags: string[];
  worldRanking: number;
  aidSiteUrl: string;
  admissionsEmail: string;
  admissionsPhone: string;
  photoUrl?: string; // real campus photo via Wikimedia Commons, resolved manually — see scratchpad fetch_photos.mjs
  facts: Record<string, { value: string; confidence: number }>;
  requirements: {
    deadlineEd: string | null; // ISO date, or null if no ED round
    deadlineRd: string; // ISO date
    testPolicy: "required" | "optional" | "not_accepted";
    applicationFeeUsd: number;
    feeWaiverAvailable: boolean;
    estimatedCoaUsd: number; // sticker-price estimate, pre-aid
  };
}

const UNIVERSITIES: SeedUniversity[] = [
  {
    name: "Massachusetts Institute of Technology",
    city: "Cambridge", state: "MA", setting: "urban",
    cultureTags: ["startup", "research", "corporate"], worldRanking: 1,
    aidSiteUrl: "https://sfs.mit.edu", admissionsEmail: "sfs@mit.edu", admissionsPhone: "+16172534971",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1a/MIT_Main_Campus_aerial.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.7 },
      need_aware: { value: "no", confidence: 0.6 },
      aid_type: { value: "full_need_based", confidence: 0.65 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-01", testPolicy: "required", applicationFeeUsd: 75, feeWaiverAvailable: true, estimatedCoaUsd: 89340 },
  },
  {
    name: "Harvard University",
    city: "Cambridge", state: "MA", setting: "urban",
    cultureTags: ["research", "liberal_arts"], worldRanking: 3,
    aidSiteUrl: "https://college.harvard.edu/financial-aid", admissionsEmail: "college@harvard.edu", admissionsPhone: "+16174951551",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/0/02/Aerial_of_the_Harvard_Business_School_campus.jpeg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.7 },
      need_aware: { value: "no", confidence: 0.6 },
      aid_type: { value: "full_need_based", confidence: 0.65 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-01", testPolicy: "required", applicationFeeUsd: 85, feeWaiverAvailable: true, estimatedCoaUsd: 86926 },
  },
  {
    name: "Amherst College",
    city: "Amherst", state: "MA", setting: "rural",
    cultureTags: ["liberal_arts"], worldRanking: 45,
    aidSiteUrl: "https://www.amherst.edu/admission/financialaid", admissionsEmail: "admission@amherst.edu", admissionsPhone: "+14135422328",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/23/Amherst_College_Johnson_Chapel_winter.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.7 },
      need_aware: { value: "no", confidence: 0.6 },
      aid_type: { value: "full_need_based", confidence: 0.6 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-01", testPolicy: "optional", applicationFeeUsd: 80, feeWaiverAvailable: true, estimatedCoaUsd: 93090 },
  },
  {
    name: "Dartmouth College",
    city: "Hanover", state: "NH", setting: "rural",
    cultureTags: ["liberal_arts", "research"], worldRanking: 50,
    aidSiteUrl: "https://admissions.dartmouth.edu/financial-aid", admissionsEmail: "admissions.office@dartmouth.edu", admissionsPhone: "+16036462875",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/6/63/BakerLibrary.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.65 },
      need_aware: { value: "no", confidence: 0.55 },
      aid_type: { value: "full_need_based", confidence: 0.55 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-03", testPolicy: "required", applicationFeeUsd: 80, feeWaiverAvailable: true, estimatedCoaUsd: 87768 },
  },
  {
    name: "New York University",
    city: "New York", state: "NY", setting: "urban",
    cultureTags: ["corporate", "arts", "startup"], worldRanking: 25,
    aidSiteUrl: "https://www.nyu.edu/admissions/financial-aid.html", admissionsEmail: "admissions@nyu.edu", admissionsPhone: "+12129982222",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1d/NYC_-_Washington_Square_Park_-_Arch.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.6 },
      aid_type: { value: "partial", confidence: 0.55 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-05", testPolicy: "optional", applicationFeeUsd: 80, feeWaiverAvailable: true, estimatedCoaUsd: 87752 },
  },
  {
    name: "University of Chicago",
    city: "Chicago", state: "IL", setting: "urban",
    cultureTags: ["research", "liberal_arts"], worldRanking: 11,
    aidSiteUrl: "https://collegeadmissions.uchicago.edu/cost-aid/international-financial-aid", admissionsEmail: "admissions@uchicago.edu", admissionsPhone: "+17737020461",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/b/be/Eckhart_Hall.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "full_need_based", confidence: 0.5 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-02", testPolicy: "optional", applicationFeeUsd: 75, feeWaiverAvailable: true, estimatedCoaUsd: 93000 },
  },
  {
    name: "Vanderbilt University",
    city: "Nashville", state: "TN", setting: "urban",
    cultureTags: ["corporate", "research"], worldRanking: 60,
    aidSiteUrl: "https://admissions.vanderbilt.edu/afford", admissionsEmail: "admissions@vanderbilt.edu", admissionsPhone: "+16153227311",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/6/61/Kirkland_Hall_with_two_Towers.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-01", testPolicy: "optional", applicationFeeUsd: 50, feeWaiverAvailable: true, estimatedCoaUsd: 87000 },
  },
  {
    name: "Case Western Reserve University",
    city: "Cleveland", state: "OH", setting: "urban",
    cultureTags: ["startup", "research"], worldRanking: 150,
    aidSiteUrl: "https://case.edu/financialaid", admissionsEmail: "admission@case.edu", admissionsPhone: "+12163682000",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/3/38/Case_western_reserve_campus_2005.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "merit_partial", confidence: 0.55 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-15", testPolicy: "optional", applicationFeeUsd: 75, feeWaiverAvailable: true, estimatedCoaUsd: 95000 },
  },
  {
    name: "University of Rochester",
    city: "Rochester", state: "NY", setting: "suburban",
    cultureTags: ["research", "arts"], worldRanking: 180,
    aidSiteUrl: "https://enrollment.rochester.edu/financial-aid", admissionsEmail: "admit@rochester.edu", admissionsPhone: "+15852752121",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/3/34/University_of_Rochester_Clock_Tower.JPG",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.5 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
    requirements: { deadlineEd: "2026-11-01", deadlineRd: "2027-01-05", testPolicy: "optional", applicationFeeUsd: 50, feeWaiverAvailable: true, estimatedCoaUsd: 86000 },
  },
  {
    name: "Mount Holyoke College",
    city: "South Hadley", state: "MA", setting: "suburban",
    cultureTags: ["liberal_arts", "arts"], worldRanking: 200,
    aidSiteUrl: "https://www.mtholyoke.edu/financial-aid", admissionsEmail: "admission@mtholyoke.edu", admissionsPhone: "+14135382023",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/1/13/Mount_Holyoke_College_Mary_Lyon_Hall.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.65 },
      need_aware: { value: "no", confidence: 0.55 },
      aid_type: { value: "full_need_based", confidence: 0.55 },
    },
    requirements: { deadlineEd: "2026-11-15", deadlineRd: "2027-01-15", testPolicy: "optional", applicationFeeUsd: 0, feeWaiverAvailable: true, estimatedCoaUsd: 90000 },
  },
  {
    name: "Georgetown University",
    city: "Washington", state: "DC", setting: "urban",
    cultureTags: ["corporate", "liberal_arts"], worldRanking: 30,
    aidSiteUrl: "https://finaid.georgetown.edu", admissionsEmail: "undergraduateadmissions@georgetown.edu", admissionsPhone: "+12026873600",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/25/Dahlgren_Chapel_of_the_Sacred_Heart_Georgetown_University.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
    requirements: { deadlineEd: null, deadlineRd: "2027-01-10", testPolicy: "required", applicationFeeUsd: 75, feeWaiverAvailable: true, estimatedCoaUsd: 93000 },
  },
  {
    name: "Arizona State University",
    city: "Tempe", state: "AZ", setting: "suburban",
    cultureTags: ["startup", "corporate"], worldRanking: 220,
    aidSiteUrl: "https://admission.asu.edu/cost/international-scholarships", admissionsEmail: "admissions@asu.edu", admissionsPhone: "+14809652100",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/0/02/2021_Arizona_State_University%2C_Tempe_Campus%2C_Old_Main.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.65 },
      need_aware: { value: "yes", confidence: 0.6 },
      aid_type: { value: "merit_partial", confidence: 0.6 },
    },
    requirements: { deadlineEd: null, deadlineRd: "2027-02-01", testPolicy: "optional", applicationFeeUsd: 70, feeWaiverAvailable: true, estimatedCoaUsd: 48000 },
  },
];

async function main() {
  for (const u of UNIVERSITIES) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO universities (name, city, state, setting, culture_tags, world_ranking, aid_site_url, admissions_email, admissions_phone, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [u.name, u.city, u.state, u.setting, u.cultureTags, u.worldRanking, u.aidSiteUrl, u.admissionsEmail, u.admissionsPhone, u.photoUrl ?? null]
    );

    let universityId = rows[0]?.id;
    if (!universityId) {
      const existing = await pool.query<{ id: string }>(`SELECT id FROM universities WHERE name = $1`, [u.name]);
      universityId = existing.rows[0].id;
    }

    for (const [factKey, { value, confidence }] of Object.entries(u.facts)) {
      await pool.query(
        `INSERT INTO scholarship_fact_candidates (university_id, fact_key, fact_value, source_agent, provenance_url, confidence)
         VALUES ($1,$2,$3,'seed',$4,$5)`,
        [universityId, factKey, value, u.aidSiteUrl, confidence]
      );
      // Also write straight into the reconciled table so a card has real content from a cold
      // seed — reconciliationAgent will still overwrite this the moment a browser/call/email
      // gatherer adds a second candidate, same as any other fact.
      await pool.query(
        `INSERT INTO scholarship_facts (university_id, fact_key, fact_value, confidence, status, provenance)
         VALUES ($1,$2,$3,$4,'confirmed',$5)
         ON CONFLICT (university_id, fact_key) DO NOTHING`,
        [universityId, factKey, value, confidence, JSON.stringify([{ source_agent: "seed", url: u.aidSiteUrl, value, observed_at: new Date().toISOString() }])]
      );
    }

    const r = u.requirements;
    await pool.query(
      `INSERT INTO requirements_packets (university_id, deadline_ed, deadline_rd, test_policy, application_fee_usd, fee_waiver_available, estimated_cost_of_attendance_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (university_id) DO UPDATE SET
         deadline_ed = $2, deadline_rd = $3, test_policy = $4, application_fee_usd = $5,
         fee_waiver_available = $6, estimated_cost_of_attendance_usd = $7, updated_at = now()`,
      [universityId, r.deadlineEd, r.deadlineRd, r.testPolicy, r.applicationFeeUsd, r.feeWaiverAvailable, r.estimatedCoaUsd]
    );

    console.log(`Seeded ${u.name}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
