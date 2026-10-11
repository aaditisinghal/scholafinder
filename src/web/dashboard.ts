/**
 * Live data behind the agent-orchestration dashboard (GET /dashboard). Pure read-only
 * aggregation over Tiger Data — no agent logic lives here, just a snapshot of what each
 * agent in the roster has actually done.
 */
import { pool } from "../db/pool.js";

export interface AgentStat {
  id: string;
  label: string;
  group: "boss" | "gatherer" | "resolver" | "monitor" | "reward";
  count: number;
  detail: string;
  lastActivity: string | null;
}

export async function getDashboardSnapshot(): Promise<{ agents: AgentStat[]; generatedAt: string }> {
  const [
    students,
    browserCandidates,
    callStatus,
    emailStatus,
    facts,
    trueCost,
    requirements,
    swipesYes,
    needAware,
    policyChanges,
    deadlines,
    rewards,
  ] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n, max(created_at) AS last FROM students`),
    pool.query(`SELECT count(*)::int AS n, max(observed_at) AS last FROM scholarship_fact_candidates WHERE source_agent = 'browser'`),
    pool.query(`SELECT status, count(*)::int AS n FROM outreach_calls GROUP BY status`),
    pool.query(`SELECT status, count(*)::int AS n FROM outreach_emails GROUP BY status`),
    pool.query(`SELECT status, count(*)::int AS n FROM scholarship_facts GROUP BY status`),
    pool.query(`SELECT count(*)::int AS n, max(computed_at) AS last FROM true_cost`),
    pool.query(`SELECT count(*)::int AS n, max(updated_at) AS last FROM requirements_packets`),
    pool.query(`SELECT count(*)::int AS n, max(decided_at) AS last FROM swipes WHERE decision = 'yes' AND card_text IS NOT NULL`),
    pool.query(`SELECT count(*)::int AS n, max(updated_at) AS last FROM scholarship_facts WHERE fact_key = 'need_aware'`),
    pool.query(`SELECT count(*)::int AS n, max(detected_at) AS last FROM policy_change_log`),
    pool.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE reminded_at IS NOT NULL)::int AS reminded, max(created_at) AS last FROM deadlines`),
    pool.query(`SELECT status, count(*)::int AS n, max(created_at) AS last FROM rewards GROUP BY status`),
  ]);

  const callByStatus = Object.fromEntries(callStatus.rows.map((r) => [r.status, r.n]));
  const emailByStatus = Object.fromEntries(emailStatus.rows.map((r) => [r.status, r.n]));
  const factsByStatus = Object.fromEntries(facts.rows.map((r) => [r.status, r.n]));
  const rewardByStatus = Object.fromEntries(rewards.rows.map((r) => [r.status, r.n]));
  const totalCalls = callStatus.rows.reduce((s, r) => s + r.n, 0);
  const totalEmails = emailStatus.rows.reduce((s, r) => s + r.n, 0);
  const totalFacts = facts.rows.reduce((s, r) => s + r.n, 0);
  const totalRewards = rewards.rows.reduce((s, r) => s + r.n, 0);

  const agents: AgentStat[] = [
    {
      id: "boss",
      label: "Boss Agent",
      group: "boss",
      count: students.rows[0].n,
      detail: `${students.rows[0].n} student${students.rows[0].n === 1 ? "" : "s"} onboarded over iMessage`,
      lastActivity: students.rows[0].last,
    },
    {
      id: "browser",
      label: "Browser Gatherer",
      group: "gatherer",
      count: browserCandidates.rows[0].n,
      detail: `${browserCandidates.rows[0].n} live page scrape${browserCandidates.rows[0].n === 1 ? "" : "s"}`,
      lastActivity: browserCandidates.rows[0].last,
    },
    {
      id: "call",
      label: "Call Gatherer",
      group: "gatherer",
      count: totalCalls,
      detail: `${callByStatus.completed ?? 0} completed, ${callByStatus.pending ?? 0} pending, ${callByStatus.failed ?? 0} failed`,
      lastActivity: null,
    },
    {
      id: "email",
      label: "Email Gatherer",
      group: "gatherer",
      count: totalEmails,
      detail: `${emailByStatus.sent ?? 0} sent, ${emailByStatus.replied ?? 0} replied, ${emailByStatus.pending ?? 0} pending`,
      lastActivity: null,
    },
    {
      id: "reconciliation",
      label: "Reconciliation",
      group: "resolver",
      count: totalFacts,
      detail: `${factsByStatus.confirmed ?? 0} confirmed, ${factsByStatus.conflicting ?? 0} conflicting, ${factsByStatus.stale ?? 0} stale`,
      lastActivity: null,
    },
    {
      id: "truecost",
      label: "True-Cost",
      group: "resolver",
      count: trueCost.rows[0].n,
      detail: `${trueCost.rows[0].n} net-cost calculation${trueCost.rows[0].n === 1 ? "" : "s"}`,
      lastActivity: trueCost.rows[0].last,
    },
    {
      id: "requirements",
      label: "Requirements/Packet",
      group: "resolver",
      count: requirements.rows[0].n,
      detail: `${requirements.rows[0].n} requirements packet${requirements.rows[0].n === 1 ? "" : "s"} built`,
      lastActivity: requirements.rows[0].last,
    },
    {
      id: "profilematch",
      label: "Profile-Match",
      group: "resolver",
      count: swipesYes.rows[0].n,
      detail: `ranks the swipe stack on every student visit`,
      lastActivity: swipesYes.rows[0].last,
    },
    {
      id: "explainer",
      label: "Explainer",
      group: "resolver",
      count: swipesYes.rows[0].n,
      detail: `${swipesYes.rows[0].n} swipe card${swipesYes.rows[0].n === 1 ? "" : "s"} explained`,
      lastActivity: swipesYes.rows[0].last,
    },
    {
      id: "needaware",
      label: "Need-Aware Flag",
      group: "resolver",
      count: needAware.rows[0].n,
      detail: `${needAware.rows[0].n} school${needAware.rows[0].n === 1 ? "" : "s"} flagged need-aware/blind`,
      lastActivity: needAware.rows[0].last,
    },
    {
      id: "policymonitor",
      label: "Policy-Monitor",
      group: "monitor",
      count: policyChanges.rows[0].n,
      detail: `${policyChanges.rows[0].n} drift${policyChanges.rows[0].n === 1 ? "" : "s"} detected on recheck`,
      lastActivity: policyChanges.rows[0].last,
    },
    {
      id: "deadline",
      label: "Deadline",
      group: "monitor",
      count: deadlines.rows[0].n,
      detail: `${deadlines.rows[0].reminded}/${deadlines.rows[0].n} reminders sent`,
      lastActivity: deadlines.rows[0].last,
    },
    {
      id: "reward",
      label: "Solana Reward",
      group: "reward",
      count: totalRewards,
      detail: `${rewardByStatus.sent ?? 0} sent, ${rewardByStatus.pending ?? 0} pending, ${rewardByStatus.failed ?? 0} failed`,
      lastActivity: null,
    },
  ];

  return { agents, generatedAt: new Date().toISOString() };
}
