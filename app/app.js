/**
 * Foundry Agent Tab — frontend.
 *
 * No framework, no build step: the point of this repo is that you can read it in one
 * sitting and see exactly how a Teams tab talks to Foundry Agent Service.
 *
 * The tab holds no credential. Everything goes through /api on our own backend.
 */

const $ = (id) => document.getElementById(id);
const el = {
  agentList: $("agentList"), agentName: $("agentName"), agentTools: $("agentTools"),
  thread: $("thread"), messages: $("messages"), input: $("input"), send: $("sendBtn"),
  reset: $("resetBtn"), filter: $("filter"), project: $("projectName"),
  statusDot: $("statusDot"), statusText: $("statusText"), live: $("live"),
  turnMeta: $("turnMeta"), sidebar: $("sidebar"), menuBtn: $("menuBtn"),
};

const state = { agents: [], current: null, conversation: null, busy: false };

/* ---------- Teams host ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme =
    theme === "dark" ? "dark" : theme === "contrast" ? "contrast" : "default";
}

async function initTeams() {
  // Outside Teams the SDK simply never initializes; the tab stays a normal web page.
  if (!window.microsoftTeams) return;
  try {
    await microsoftTeams.app.initialize();
    const ctx = await microsoftTeams.app.getContext();
    applyTheme(ctx.app.theme);
    microsoftTeams.app.registerOnThemeChangeHandler(applyTheme);
    microsoftTeams.app.notifySuccess();
  } catch {
    /* not hosted in Teams */
  }
}

/* ---------- helpers ---------- */

const icons = {
  agent: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M8 14h.01M16 14h.01"/></svg>',
  tool: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5z"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Citations come back from a tool (web search), so their URLs are model-influenced
 * input, not our data. Only http(s) is allowed to reach an href — anything else
 * (javascript:, data:) renders as plain text instead.
 */
function safeUrl(u) {
  try {
    const p = new URL(u, location.origin);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

/** Just enough markdown for what an agent actually returns. */
function render(md) {
  let h = esc(md);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Grounded answers come back with inline links. Left as text they are noise;
  // the URL is already escaped, so re-check the scheme before it becomes an href.
  h = h.replace(/\[([^\]\n]+)\]\((https?:&#x2F;&#x2F;[^\s)]+|https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const href = safeUrl(url.replace(/&#x2F;/g, "/").replace(/&amp;/g, "&"));
    return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
  });
  h = h.replace(/\[(\d+)\]/g, '<sup class="source__n">$1</sup>');
  return h.split(/\n{2,}/).map((b) => {
    if (b.startsWith("<pre>")) return b;
    if (/^\s*[-*]\s+/m.test(b)) {
      const items = b.split("\n").filter((l) => l.trim()).map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`);
      return `<ul>${items.join("")}</ul>`;
    }
    return `<p>${b.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

const toolLabel = (n) => ({
  web_search: "Web search", file_search: "File search", code_interpreter: "Code interpreter",
  azure_ai_search: "Azure AI Search", mcp_list_tools: "MCP tools", function: "Function",
}[n] || n.replace(/_/g, " "));

function stick() {
  const m = el.messages;
  if (m.scrollHeight - m.scrollTop - m.clientHeight < 160) m.scrollTop = m.scrollHeight;
}

/* ---------- rendering ---------- */

function renderAgents(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = state.agents.filter((a) =>
    !q || a.name.toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q));

  el.agentList.innerHTML = `<div class="agents__label">${
    q ? `${list.length} match${list.length === 1 ? "" : "es"}` : "Available"}</div>`;

  if (!list.length) {
    el.agentList.insertAdjacentHTML("beforeend",
      `<p style="padding:8px 10px;font-size:var(--t-meta);color:var(--ink-muted)">No agent matches “${esc(filter)}”.</p>`);
    return;
  }

  for (const a of list) {
    const b = document.createElement("button");
    b.className = "agent";
    b.setAttribute("aria-current", String(a.name === state.current?.name));
    b.innerHTML = `<span class="agent__dot"></span>
      <span style="min-width:0">
        <span class="agent__name">${esc(a.name)}</span>
        <span class="agent__meta">${esc(a.model || "")}${a.version ? " · v" + a.version : ""}</span>
      </span>`;
    b.onclick = () => selectAgent(a.name);
    el.agentList.append(b);
  }
}

function starters(agent) {
  const t = agent.tools || [];
  const out = [];
  if (t.includes("web_search")) out.push("What changed in Microsoft Foundry this month?");
  if (t.includes("file_search") || t.includes("azure_ai_search"))
    out.push("What does our documentation say about device enrollment?");
  if (t.includes("code_interpreter")) out.push("Chart the last four weeks of ticket volume.");
  out.push("What can you help me with?");
  return out.slice(0, 3);
}

function showEmpty() {
  const a = state.current;
  if (!a) return;
  el.thread.innerHTML = `
    <div class="empty">
      <h1 class="empty__title">${esc(a.name)}</h1>
      <p class="empty__sub">${esc(a.description || a.instructions || "Ask this agent a question.").slice(0, 180)}</p>
      <p class="empty__label">Try one of these</p>
      <div class="starters">
        ${starters(a).map((s) => `<button class="starter" data-q="${esc(s)}"><span>${esc(s)}</span>${icons.arrow}</button>`).join("")}
      </div>
    </div>`;
  el.thread.querySelectorAll(".starter").forEach((b) =>
    b.addEventListener("click", () => ask(b.dataset.q)));
}

function addUser(text) {
  const d = document.createElement("div");
  d.className = "msg msg--user";
  d.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  el.thread.append(d);
  stick();
}

function addAgentShell() {
  const d = document.createElement("div");
  d.className = "msg msg--agent";
  d.innerHTML = `<div class="avatar">${icons.agent}</div>
    <div style="min-width:0">
      <div class="answer"><div class="skeleton"><span></span><span></span><span></span></div></div>
      <div class="trace" hidden></div>
      <div class="sources" hidden></div>
    </div>`;
  el.thread.append(d);
  stick();
  return {
    answer: d.querySelector(".answer"),
    trace: d.querySelector(".trace"),
    sources: d.querySelector(".sources"),
  };
}

function banner(title, message) {
  const d = document.createElement("div");
  d.className = "msg";
  d.innerHTML = `<div class="banner">${icons.warn}<div><div class="banner__title">${esc(title)}</div><div>${esc(message)}</div></div></div>`;
  el.thread.append(d);
  stick();
}

/* ---------- data ---------- */

async function loadAgents() {
  try {
    const r = await fetch("/api/agents");
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || "Could not load agents");

    state.agents = b.agents || [];
    el.statusDot.className = "status-dot";
    el.statusText.textContent = `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"} · Foundry`;

    if (!state.agents.length) {
      el.agentList.innerHTML = `<div class="agents__label">Available</div>
        <p style="padding:8px 10px;font-size:var(--t-meta);color:var(--ink-muted)">
        No agents in this project yet. Create one in the Foundry portal, then reload.</p>`;
      el.thread.innerHTML = `<div class="empty"><h1 class="empty__title">No agents yet</h1>
        <p class="empty__sub">This project has no agents. Build one under <strong>Build → Agents</strong> in the Foundry portal, give it instructions and a tool, and it shows up here.</p></div>`;
      return;
    }
    renderAgents();
    selectAgent(state.agents[0].name);
  } catch (e) {
    el.statusDot.className = "status-dot status-dot--off";
    el.statusText.textContent = "Disconnected";
    el.agentList.innerHTML = `<div class="agents__label">Available</div>`;
    banner("Cannot reach Foundry", e.message);
  }
}

function selectAgent(name) {
  const a = state.agents.find((x) => x.name === name);
  if (!a) return;
  state.current = a;
  state.conversation = null;
  el.agentName.textContent = a.name;
  el.agentTools.innerHTML =
    `<span class="tag">${esc(a.model || "model")}</span>` +
    (a.tools || []).map((t) => `<span class="tag">${esc(toolLabel(t))}</span>`).join("");
  el.input.disabled = false;
  el.input.placeholder = `Ask ${a.name}…`;
  el.reset.disabled = true;
  el.turnMeta.textContent = "";
  renderAgents(el.filter.value);
  showEmpty();
  el.sidebar.dataset.open = "false";
  el.menuBtn.setAttribute("aria-expanded", "false");
}

async function ask(text) {
  if (state.busy || !state.current || !text.trim()) return;
  state.busy = true;
  el.send.disabled = true;
  el.input.value = "";
  el.input.style.height = "auto";

  if (el.thread.querySelector(".empty")) el.thread.innerHTML = "";
  addUser(text);
  const ui = addAgentShell();
  el.live.textContent = "Agent is answering";

  let answer = "";
  const tools = [];
  const sources = [];

  const paint = (streaming) => {
    ui.answer.innerHTML = render(answer) + (streaming ? '<span class="caret"></span>' : "");
    if (tools.length) {
      ui.trace.hidden = false;
      ui.trace.innerHTML = tools.map((t) => `<span class="chip">${icons.tool}${esc(toolLabel(t))}</span>`).join("");
    }
    if (sources.length) {
      ui.sources.hidden = false;
      ui.sources.innerHTML = sources.map((s, i) => {
        const href = s.url ? safeUrl(s.url) : null;
        return href
          ? `<a class="source" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><span class="source__n">${i + 1}</span><span class="source__t">${esc(s.title)}</span></a>`
          : `<div class="source"><span class="source__n">${i + 1}</span><span class="source__t">${esc(s.title)}</span></div>`;
      }).join("");
    }
    stick();
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: state.current.name, message: text, conversation: state.conversation,
      }),
    });
    if (!res.ok || !res.body) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let first = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() || "";

      for (const frame of frames) {
        const ev = (frame.match(/^event: (.+)$/m) || [])[1];
        const dataLine = (frame.match(/^data: (.+)$/m) || [])[1];
        if (!ev || !dataLine) continue;
        const d = JSON.parse(dataLine);

        if (ev === "token") {
          if (first) { ui.answer.innerHTML = ""; first = false; }
          answer += d.delta;
          paint(true);
        } else if (ev === "tool") {
          if (!tools.includes(d.name)) tools.push(d.name);
          paint(true);
        } else if (ev === "citation") {
          sources.push(d);
          paint(true);
        } else if (ev === "done") {
          state.conversation = d.conversation;
          paint(false);
          el.reset.disabled = false;
          if (d.usage?.total_tokens) el.turnMeta.textContent = `${d.usage.total_tokens} tokens`;
          el.live.textContent = "Answer complete";
        } else if (ev === "error") {
          throw new Error(d.message);
        }
      }
    }
    if (first) { ui.answer.innerHTML = "<p>The agent returned no text.</p>"; }
  } catch (e) {
    ui.answer.innerHTML = "";
    banner("The agent could not answer", e.message);
    el.live.textContent = "The agent could not answer";
  } finally {
    state.busy = false;
    el.send.disabled = !el.input.value.trim();
  }
}

/* ---------- events ---------- */

el.input.addEventListener("input", () => {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
  el.send.disabled = state.busy || !el.input.value.trim();
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(el.input.value); }
});

el.send.addEventListener("click", () => ask(el.input.value));
el.filter.addEventListener("input", () => renderAgents(el.filter.value));

el.reset.addEventListener("click", () => {
  state.conversation = null;
  el.turnMeta.textContent = "";
  el.reset.disabled = true;
  showEmpty();
  el.input.focus();
});

el.menuBtn.addEventListener("click", () => {
  const open = el.sidebar.dataset.open !== "true";
  el.sidebar.dataset.open = String(open);
  el.menuBtn.setAttribute("aria-expanded", String(open));
});

// ⌘/Ctrl+K jumps to the agent search — the muscle memory every Teams user has.
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    el.sidebar.dataset.open = "true";
    el.filter.focus();
    el.filter.select();
  }
});

initTeams();
loadAgents();
fetch("/api/health").then((r) => r.json()).then((h) => {
  const m = (h.endpoint || "").match(/projects\/([^/?]+)/);
  el.project.textContent = m ? m[1] : "Foundry project";
}).catch(() => { el.project.textContent = "no backend"; });
