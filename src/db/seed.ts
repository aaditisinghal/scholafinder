/**
 * Seed data for the demo. These scholarship_fact_candidates rows are placeholders
 * based on general public reputation, NOT verified live research — confidence is kept
 * at or below 0.7 on purpose, and source_agent is "seed" so reconciliationAgent and
 * policyMonitorAgent both know to treat them as provisional until a browser/call/email
 * gatherer confirms or contradicts them. Re-run the browser agent against aid_site_url
 * before relying on any of this with a real student.
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
  },
  {
    name: "New York University",
    city: "New York", state: "NY", setting: "urban",
    cultureTags: ["corporate", "arts", "startup"], worldRanking: 25,
    aidSiteUrl: "https://www.nyu.edu/admissions/financial-aid.html", admissionsEmail: "admissions@nyu.edu", admissionsPhone: "+12129982222",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.6 },
      aid_type: { value: "partial", confidence: 0.55 },
    },
  },
  {
    name: "University of Chicago",
    city: "Chicago", state: "IL", setting: "urban",
    cultureTags: ["research", "liberal_arts"], worldRanking: 11,
    aidSiteUrl: "https://collegeadmissions.uchicago.edu/costs-aid", admissionsEmail: "admissions@uchicago.edu", admissionsPhone: "+17737020461",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/b/be/Eckhart_Hall.jpg",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "full_need_based", confidence: 0.5 },
    },
  },
  {
    name: "Vanderbilt University",
    city: "Nashville", state: "TN", setting: "urban",
    cultureTags: ["corporate", "research"], worldRanking: 60,
    aidSiteUrl: "https://admissions.vanderbilt.edu/afford", admissionsEmail: "admissions@vanderbilt.edu", admissionsPhone: "+16153227311",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
  },
  {
    name: "Case Western Reserve University",
    city: "Cleveland", state: "OH", setting: "urban",
    cultureTags: ["startup", "research"], worldRanking: 150,
    aidSiteUrl: "https://case.edu/financialaid", admissionsEmail: "admission@case.edu", admissionsPhone: "+12163682000",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "merit_partial", confidence: 0.55 },
    },
  },
  {
    name: "University of Rochester",
    city: "Rochester", state: "NY", setting: "suburban",
    cultureTags: ["research", "arts"], worldRanking: 180,
    aidSiteUrl: "https://enrollment.rochester.edu/financial-aid", admissionsEmail: "admit@rochester.edu", admissionsPhone: "+15852752121",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.5 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
  },
  {
    name: "Mount Holyoke College",
    city: "South Hadley", state: "MA", setting: "suburban",
    cultureTags: ["liberal_arts", "arts"], worldRanking: 200,
    aidSiteUrl: "https://www.mtholyoke.edu/financial-aid", admissionsEmail: "admission@mtholyoke.edu", admissionsPhone: "+14135382023",
    facts: {
      international_eligible: { value: "yes", confidence: 0.65 },
      need_aware: { value: "no", confidence: 0.55 },
      aid_type: { value: "full_need_based", confidence: 0.55 },
    },
  },
  {
    name: "Georgetown University",
    city: "Washington", state: "DC", setting: "urban",
    cultureTags: ["corporate", "liberal_arts"], worldRanking: 30,
    aidSiteUrl: "https://financialaid.georgetown.edu", admissionsEmail: "undergraduateadmissions@georgetown.edu", admissionsPhone: "+12026873600",
    facts: {
      international_eligible: { value: "yes", confidence: 0.6 },
      need_aware: { value: "yes", confidence: 0.55 },
      aid_type: { value: "partial", confidence: 0.5 },
    },
  },
  {
    name: "Arizona State University",
    city: "Tempe", state: "AZ", setting: "suburban",
    cultureTags: ["startup", "corporate"], worldRanking: 220,
    aidSiteUrl: "https://admission.asu.edu/cost/international-scholarships", admissionsEmail: "admissions@asu.edu", admissionsPhone: "+14809652100",
    facts: {
      international_eligible: { value: "yes", confidence: 0.65 },
      need_aware: { value: "yes", confidence: 0.6 },
      aid_type: { value: "merit_partial", confidence: 0.6 },
    },
  },
];

async function main() {
  for (const u of UNIVERSITIES) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO universities (name, city, state, setting, culture_tags, world_ranking, aid_site_url, admissions_email, admissions_phone, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING
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
    }
    console.log(`Seeded ${u.name}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
