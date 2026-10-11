export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scholafinder — Agent Orchestration</title>
<style>
  :root {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --surface-2: #222221;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --muted: #898781;
    --hairline: #2c2c2a;
    --border: rgba(255,255,255,0.10);
    --boss: #eb6834;
    --gatherer: #3987e5;
    --resolver: #199e70;
    --monitor: #c98500;
    --reward: #9085e9;
    --good: #0ca30c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px 20px 64px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 13px; margin: 0 0 28px; }
  .meta { color: var(--muted); font-size: 12px; margin-top: 4px; }

  .diagram {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 16px;
    margin-bottom: 32px;
  }
  svg { display: block; margin: 0 auto; width: 100%; height: auto; max-width: 980px; }
  .node-box { fill: var(--surface-2); stroke-width: 1.5; rx: 8; }
  .node-label { fill: var(--text-primary); font-size: 12px; font-weight: 600; font-family: system-ui, sans-serif; }
  .node-sub { fill: var(--muted); font-size: 10px; font-family: system-ui, sans-serif; }
  .edge { stroke: var(--hairline); stroke-width: 1.5; fill: none; }
  .group-label { fill: var(--muted); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; font-family: system-ui, sans-serif; }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
  .group-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
  }
  .group-card h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 0 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .agent-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 0;
    border-top: 1px solid var(--hairline);
    gap: 12px;
  }
  .agent-row:first-of-type { border-top: none; }
  .agent-name { font-size: 13px; font-weight: 500; }
  .agent-detail { font-size: 12px; color: var(--text-secondary); text-align: right; flex-shrink: 0; }
  .agent-count { font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 600; margin-right: 6px; }
  .status { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .status.active { background: var(--good); }
  .status.idle { background: var(--muted); }
</style>
</head>
<body>
  <h1>Scholafinder — Agent Orchestration</h1>
  <p class="subtitle">How the boss agent deploys and reads from the full subagent roster. Live data from Tiger Data, refreshes every 5s.</p>

  <div class="diagram">
    <svg id="flow-svg" viewBox="0 0 1040 520" xmlns="http://www.w3.org/2000/svg"></svg>
  </div>

  <div class="groups" id="groups"></div>
  <p class="meta" id="generated-at"></p>

<script>
const GROUP_META = {
  gatherer: { label: 'Gatherers', color: 'var(--gatherer)' },
  resolver: { label: 'Resolvers', color: 'var(--resolver)' },
  monitor:  { label: 'Monitors', color: 'var(--monitor)' },
  reward:   { label: 'Reward', color: 'var(--reward)' },
};

const DIAGRAM_LAYOUT = {
  boss: { x: 460, y: 20, w: 140, h: 48 },
  gatherer: { x: 40, y: 140, items: ['browser', 'call', 'email'] },
  resolver: { x: 320, y: 140, items: ['reconciliation', 'truecost', 'requirements', 'profilematch', 'explainer', 'needaware'] },
  monitor: { x: 650, y: 140, items: ['policymonitor', 'deadline'] },
  reward: { x: 860, y: 140, items: ['reward'] },
};

function resolveVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderDiagram(agents) {
  const byId = Object.fromEntries(agents.map(a => [a.id, a]));
  const svg = document.getElementById('flow-svg');
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';

  function node(x, y, w, h, label, sub, colorVar) {
    const g = document.createElementNS(NS, 'g');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('class', 'node-box');
    rect.setAttribute('stroke', resolveVar(colorVar));
    rect.setAttribute('rx', 8);
    g.appendChild(rect);
    const t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', x + w / 2); t1.setAttribute('y', y + h / 2 - (sub ? 6 : -4));
    t1.setAttribute('text-anchor', 'middle'); t1.setAttribute('class', 'node-label');
    t1.textContent = label;
    g.appendChild(t1);
    if (sub) {
      const t2 = document.createElementNS(NS, 'text');
      t2.setAttribute('x', x + w / 2); t2.setAttribute('y', y + h / 2 + 12);
      t2.setAttribute('text-anchor', 'middle'); t2.setAttribute('class', 'node-sub');
      t2.textContent = sub;
      g.appendChild(t2);
    }
    svg.appendChild(g);
    return { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
  }

  function edge(from, to, color) {
    const path = document.createElementNS(NS, 'path');
    const midY = (from.y + from.h + to.y) / 2;
    const d = \`M \${from.cx} \${from.y + from.h} C \${from.cx} \${midY}, \${to.cx} \${midY}, \${to.cx} \${to.y}\`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'edge');
    if (color) path.setAttribute('stroke', resolveVar(color));
    svg.insertBefore(path, svg.firstChild);
  }

  const bossPos = DIAGRAM_LAYOUT.boss;
  const boss = node(bossPos.x, bossPos.y, bossPos.w, bossPos.h, 'Boss Agent', 'iMessage · Spectrum', '--boss');

  const groupLabel = (x, y, text) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('class', 'group-label');
    t.textContent = text;
    svg.appendChild(t);
  };

  for (const [groupKey, meta] of Object.entries(GROUP_META)) {
    const col = DIAGRAM_LAYOUT[groupKey];
    groupLabel(col.x, 120, meta.label);
    let y = 140;
    col.items.forEach((id) => {
      const a = byId[id];
      if (!a) return;
      const w = groupKey === 'resolver' ? 150 : 170;
      const n = node(col.x, y, w, 46, a.label, \`\${a.count} · \${a.detail.split(' ').slice(0,3).join(' ')}\`, \`--\${groupKey}\`);
      edge(boss, n, \`--\${groupKey}\`);
      y += 60;
    });
  }
}

function renderGroups(agents) {
  const container = document.getElementById('groups');
  container.innerHTML = '';
  const order = ['gatherer', 'resolver', 'monitor', 'reward'];
  for (const groupKey of order) {
    const meta = GROUP_META[groupKey];
    const items = agents.filter(a => a.group === groupKey);
    if (items.length === 0) continue;
    const card = document.createElement('div');
    card.className = 'group-card';
    const h2 = document.createElement('h2');
    h2.innerHTML = \`<span class="dot" style="background:\${resolveVar('--' + groupKey)}"></span> \${meta.label}\`;
    card.appendChild(h2);
    items.forEach(a => {
      const row = document.createElement('div');
      row.className = 'agent-row';
      const statusClass = a.count > 0 ? 'active' : 'idle';
      row.innerHTML = \`
        <span class="agent-name"><span class="status \${statusClass}"></span>\${a.label}</span>
        <span class="agent-detail"><span class="agent-count">\${a.count}</span>\${a.detail}</span>
      \`;
      card.appendChild(row);
    });
    container.appendChild(card);
  }

  const bossCard = document.createElement('div');
  bossCard.className = 'group-card';
  const boss = agents.find(a => a.id === 'boss');
  if (boss) {
    bossCard.innerHTML = \`<h2><span class="dot" style="background:\${resolveVar('--boss')}"></span> Boss Agent</h2>
      <div class="agent-row"><span class="agent-name"><span class="status active"></span>Students onboarded</span><span class="agent-detail"><span class="agent-count">\${boss.count}</span>\${boss.detail}</span></div>\`;
    container.prepend(bossCard);
  }
}

async function tick() {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();
    renderDiagram(data.agents);
    renderGroups(data.agents);
    document.getElementById('generated-at').textContent = 'Last updated ' + new Date(data.generatedAt).toLocaleTimeString();
  } catch (err) {
    console.error('dashboard fetch failed', err);
  }
}

tick();
setInterval(tick, 5000);
</script>
</body>
</html>`;
