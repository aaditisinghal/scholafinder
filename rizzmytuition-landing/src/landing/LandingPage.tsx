import { useEffect, useState } from "react";
import { IMessagePanel } from "./IMessagePanel";
import { EmailPanel } from "./EmailPanel";
import "./landing.css";

const SMS_HREF = "sms:&body=" + encodeURIComponent("let's get started");

const PROBLEM_POINTS = [
  "Full scholarships for international students exist at hundreds of US schools — there's no single list of them.",
  "You have to check 5,000+ university websites one by one, and international eligibility is often never even mentioned.",
  "Calling admissions means international rates, time-zone roulette, and offices that don't pick up outside their own 9–5.",
  "Email takes four to five weeks for a real answer — if you get one at all.",
];

const SOLUTION_STEPS = [
  {
    n: "01",
    title: "Text Scholafinder",
    body: "Answer a few questions on iMessage — culture, location, budget, test scores, what “full ride” actually means to you.",
  },
  {
    n: "02",
    title: "It checks every school",
    body: "A browser agent reads financial aid and admissions pages across thousands of universities — including the international eligibility most schools bury or skip.",
  },
  {
    n: "03",
    title: "You swipe the matches",
    body: "A ranked, Tinder-style stack of real fits — ordered by your preferences, not the alphabet.",
  },
  {
    n: "04",
    title: "It calls and emails for you",
    body: "Swipe yes, and agents contact admissions with the exact questions international applicants need answered — on the phone and by email, as backup.",
  },
  {
    n: "05",
    title: "It watches what you're waiting on",
    body: "Deadlines and policy changes for every school still in play, texted to you before anything moves.",
  },
];

const AGENT_GROUPS: { title: string; blurb: string; agents: { name: string; copy: string; example: string }[] }[] = [
  {
    title: "Gatherers",
    blurb: "Go find the raw facts, per university.",
    agents: [
      {
        name: "Browser Gatherer",
        copy: "Scrapes every university's own aid and admissions pages directly.",
        example: "Last run: scraped financialaid.fsu.edu in 6.2s → international_eligible = yes",
      },
      {
        name: "Call Gatherer",
        copy: "Calls international admissions lines — you pick the questions over iMessage first.",
        example: "Last run: called Florida State admissions, call logged in 4.4s",
      },
      {
        name: "Email Gatherer",
        copy: "An async backup that drafts and sends from what's already on file.",
        example: "Last run: sent to financialaid@fsu.edu, logged in 0.8s",
      },
    ],
  },
  {
    title: "Resolvers",
    blurb: "Turn raw, contradictory facts into one answer you can trust.",
    agents: [
      {
        name: "Reconciliation",
        copy: "When the website, the officer, and the inbox disagree, this decides what's actually true — and says why.",
        example: "Last run: reconciled international_eligible with full provenance in 1.8s",
      },
      {
        name: "True-Cost",
        copy: "Tuition minus aid, plus what nobody mentions: health insurance, visa fees, flights. “Full tuition” isn't “full ride.”",
        example: "Last run: computed net cost — $4,610/yr after aid",
      },
      {
        name: "Requirements/Packet",
        copy: "Every deadline, every required form — CSS Profile, ISFAA — and whether a fee waiver exists.",
        example: "Last run: built packet — test policy optional, CSS Profile required",
      },
      {
        name: "Profile-Match",
        copy: "Ranks your swipe stack against what you actually asked for, best fit first.",
        example: "Last run: ranked a 9-school stack by fit in 0.3s",
      },
      {
        name: "Explainer",
        copy: "Turns a database row into a plain card: who, what, why, when, and how much.",
        example: "Last run: wrote a plain-language swipe-yes card in 1.1s",
      },
      {
        name: "Need-Aware Flag",
        copy: "Flags the handful of schools that are need-blind for internationals — checking the aid box elsewhere can hurt your odds.",
        example: "Last run: flagged a need-aware school before you swiped",
      },
    ],
  },
  {
    title: "Monitors",
    blurb: "Stay on watch after the first pass is done.",
    agents: [
      {
        name: "Policy-Monitor",
        copy: "Rechecks saved facts against the live page — flags drift instead of trusting stale data.",
        example: "Last run: rechecked a saved fact — unchanged",
      },
      {
        name: "Deadline",
        copy: "Reminds the boss agent, which reminds you, on iMessage, before it's too late.",
        example: "Last run: sent 1 deadline reminder this week",
      },
    ],
  },
  {
    title: "Reward",
    blurb: "A small thank-you for finishing the hard part.",
    agents: [
      {
        name: "Solana Reward",
        copy: "Submit to a university and get a small devnet token sent your way.",
        example: "Last run: sent a devnet SOL reward after a submission",
      },
    ],
  },
];

const DASHBOARD_PREVIEW: { group: string; items: { label: string; detail: string; status: "idle" | "running" }[] }[] = [
  {
    group: "GATHERERS",
    items: [
      { label: "BROWSER GATHERER", detail: "Scrape live aid page — Florida State University", status: "running" },
      { label: "CALL GATHERER", detail: "Call admissions (simulated) — FSU admissions logged", status: "idle" },
      { label: "EMAIL GATHERER", detail: "Draft + send admissions email — sent to financialaid@fsu.edu", status: "idle" },
    ],
  },
  {
    group: "RESOLVERS",
    items: [
      { label: "RECONCILIATION", detail: "Reconcile international_eligible — fact reconciled with provenance", status: "idle" },
      { label: "TRUE-COST", detail: "Compute true cost — net cost $4,610", status: "idle" },
      { label: "REQUIREMENTS/PACKET", detail: "Build requirements packet — Georgetown University", status: "running" },
    ],
  },
  {
    group: "MONITORS",
    items: [
      { label: "POLICY-MONITOR", detail: "Recheck fact for drift — unchanged on recheck", status: "idle" },
      { label: "DEADLINE", detail: "Check upcoming deadlines — 1 reminder sent", status: "idle" },
    ],
  },
];

const PREVIEW_TABS = ["Dashboard", "iMessage", "Email"] as const;
type PreviewTab = (typeof PREVIEW_TABS)[number];

export function LandingPage() {
  const [previewTab, setPreviewTab] = useState<PreviewTab>("Dashboard");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (name: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#fbf9f5";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    <div className="sf">
      <header className="sf-nav">
        <div className="sf-nav-inner">
          <span className="sf-wordmark">Scholafinder</span>
          <nav className="sf-nav-links">
            <a href="#how">How it works</a>
            <a href="#agents">Agents</a>
            <a href="https://scholafinder.vercel.app/orchestration">Live system</a>
          </nav>
          <a className="sf-btn sf-btn-sm" href={SMS_HREF}>
            Get started
          </a>
        </div>
      </header>

      <main>
        <section className="sf-hero">
          <div className="sf-hero-left">
            <p className="sf-eyebrow">iMessage-native &middot; built for international applicants</p>
            <h1 className="sf-h1">
              Full scholarships exist.
              <br />
              Nobody told you where.
            </h1>
            <p className="sf-hero-sub">
              5,000+ US universities each bury their international aid policy somewhere different — if they say
              anything at all. Scholafinder reads every one of them, texts you the matches, and calls admissions so
              you don't have to dial internationally at 3am.
            </p>
            <div className="sf-hero-ctas">
              <a className="sf-btn sf-btn-lg" href={SMS_HREF}>
                Text &ldquo;let's get started&rdquo;
              </a>
              <a className="sf-link-cta" href="#how">
                See how it works &darr;
              </a>
            </div>
            <p className="sf-sms-note">Opens Messages — look for Scholafinder.</p>
            <div className="sf-proof-row">
              <div className="sf-proof-chip">
                <strong>5,000+</strong>
                <span>universities tracked</span>
              </div>
              <div className="sf-proof-chip">
                <strong>12</strong>
                <span>agents working per student</span>
              </div>
              <div className="sf-proof-chip">
                <strong>0</strong>
                <span>apps to download</span>
              </div>
            </div>
          </div>

          <figure className="sf-hero-right">
            <div className="sf-fig-panel">
              <video src="/media/fig1-globe.mp4" autoPlay loop muted playsInline />
            </div>
            <figcaption>
              Fig. 1 — every white dot is a university on the list. Orange marks the ones offering full
              international funding. Illustrative, not a live feed.
            </figcaption>
          </figure>
        </section>

        <section className="sf-preview" id="preview">
          <div className="sf-section-head">
            <h2 className="sf-h2">This isn't a mockup. It's what's actually running.</h2>
            <p className="sf-section-sub">
              Three real artifacts from the live system, not diagrams drawn for this page.{" "}
              <a href="https://scholafinder.vercel.app/orchestration">Open the live dashboard &rarr;</a>
            </p>
          </div>

          <div className="sf-preview-tabs" role="tablist" aria-label="Product preview">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={previewTab === tab}
                className={`sf-preview-tab ${previewTab === tab ? "active" : ""}`}
                onClick={() => setPreviewTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {previewTab === "Dashboard" && (
            <div className="sf-dash">
              <div className="sf-dash-top">
                <span className="sf-dash-dot on" />
                BOSS AGENT <span className="sf-dash-dim">&middot; idle &middot; last ok</span>
              </div>
              <div className="sf-dash-grid">
                {DASHBOARD_PREVIEW.map((col) => (
                  <div className="sf-dash-col" key={col.group}>
                    <div className="sf-dash-col-title">{col.group}</div>
                    {col.items.map((item) => (
                      <div className={`sf-dash-card ${item.status}`} key={item.label}>
                        <div className="sf-dash-card-head">
                          <span className={`sf-dash-dot ${item.status === "running" ? "on" : ""}`} />
                          {item.label}
                        </div>
                        <div className="sf-dash-card-status">{item.status === "running" ? "RUNNING" : "IDLE · LAST OK"}</div>
                        <div className="sf-dash-card-detail">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewTab === "iMessage" && <IMessagePanel />}
          {previewTab === "Email" && <EmailPanel />}
        </section>

        <section className="sf-problem" id="how">
          <div className="sf-problem-col">
            <h3 className="sf-kicker">The problem</h3>
            <ul className="sf-problem-list">
              {PROBLEM_POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="sf-problem-close">
              Most students only ever hear about scholarships like this from a neighbor who happened to know.
            </p>
          </div>
          <div className="sf-solution-col">
            <h3 className="sf-kicker accent">What Scholafinder does</h3>
            <ol className="sf-solution-steps">
              {SOLUTION_STEPS.map((s) => (
                <li key={s.n}>
                  <span className="sf-step-n">{s.n}</span>
                  <div>
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="sf-agents" id="agents">
          <div className="sf-section-head">
            <h2 className="sf-h2">Twelve agents. One boss. Zero spreadsheets.</h2>
            <p className="sf-section-sub">The actual roster behind every swipe, call, and email.</p>
          </div>
          <div className="sf-agent-groups">
            {AGENT_GROUPS.map((group) => (
              <div className="sf-agent-group" key={group.title}>
                <div className="sf-agent-group-head">
                  <h3>{group.title}</h3>
                  <p>{group.blurb}</p>
                </div>
                <div className="sf-agent-cards">
                  {group.agents.map((a) => {
                    const open = expandedAgents.has(a.name);
                    return (
                      <button
                        type="button"
                        className={`sf-agent-card ${open ? "open" : ""}`}
                        key={a.name}
                        aria-expanded={open}
                        onClick={() => toggleAgent(a.name)}
                      >
                        <span className="sf-agent-name">
                          {a.name}
                          <span className="sf-agent-toggle">{open ? "−" : "+"}</span>
                        </span>
                        <p className="sf-agent-copy">{a.copy}</p>
                        {open && <p className="sf-agent-example">{a.example}</p>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="sf-origin">
          <p className="sf-origin-quote">
            &ldquo;I only found out the Presidential Scholarship existed because a neighbor happened to mention it.
            Every other international student figuring this out alone doesn't get that neighbor.&rdquo;
          </p>
          <p className="sf-origin-attr">— why we built Scholafinder</p>
        </section>

        <section className="sf-final-cta">
          <h2 className="sf-h2 center">Stop guessing which university will actually pay for you.</h2>
          <p className="sf-section-sub center">
            Text Scholafinder on iMessage. No app, no account, no $150 college-search subscription.
          </p>
          <a className="sf-btn sf-btn-lg" href={SMS_HREF}>
            Text &ldquo;let's get started&rdquo;
          </a>
        </section>
      </main>

      <footer className="sf-footer">
        <span className="sf-wordmark small">Scholafinder</span>
        <span className="sf-footer-tag">Built for the Photon &times; Spectrum &ldquo;Agents in iMessage&rdquo; hackathon.</span>
        <a href="https://scholafinder.vercel.app/orchestration">Live system &rarr;</a>
      </footer>
    </div>
  );
}
