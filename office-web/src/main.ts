/// <reference types="vite/client" />
import "./style.css";
import type { Agent, LogRow, RunStatus } from "./types";

type Filter = "ALL" | RunStatus;

const BASE = import.meta.env.BASE_URL;
const TZ = "Asia/Vientiane";
const state = { agents: [] as Agent[], rows: [] as LogRow[], filter: "ALL" as Filter, q: "" };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

async function load<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}data/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const badge = (s: RunStatus): string => `<span class="badge ${s === "SUCCESS" ? "ok" : "bad"}">${s}</span>`;

function statCard(label: string, value: string, hint: string): string {
  return `<div class="card stat"><p class="label">${label}</p><p class="num">${value}</p><p class="muted">${hint}</p></div>`;
}

function agentCard(a: Agent): string {
  const last = state.rows.find((r) => r.agent === a.id);
  const failed = last?.status === "FAILURE";
  return `<article class="card agent${failed ? " failed" : ""}">
    <div class="agent-head">
      <div class="avatar">${esc(a.emoji)}</div>
      <div><h3>${esc(a.name)}</h3><p class="muted">${esc(a.role)}</p></div>
    </div>
    <div class="chips"><span class="chip">⏰ ${esc(a.schedule)}</span></div>
    <div class="between">${last ? badge(last.status) : `<span class="badge idle">NO RUNS</span>`}
      <span class="mono muted">${last ? esc(last.timestamp) : "—"}</span></div>
    <div class="preview${failed ? " bad" : ""}">${last ? esc(last.message) : "Waiting for the first run"}</div>
  </article>`;
}

function feedHtml(): string {
  const q = state.q.trim().toLowerCase();
  const list = state.rows.filter(
    (r) => (state.filter === "ALL" || r.status === state.filter) && (!q || `${r.agent} ${r.message}`.toLowerCase().includes(q)),
  );
  if (list.length === 0) {
    return `<div class="empty"><p class="emoji">📭</p><p>No activity to show yet.</p></div>`;
  }
  return list
    .map((r) => {
      const emoji = state.agents.find((a) => a.id === r.agent)?.emoji ?? "🤖";
      return `<div class="feed-row${r.status === "FAILURE" ? " failed" : ""}" role="button" tabindex="0">
        <span class="mini">${esc(emoji)}</span>
        <span class="mono muted">${esc(r.timestamp)}</span>
        <strong>${esc(r.agent)}</strong>
        <span class="msg">${esc(r.message)}</span>
        ${badge(r.status)}
      </div>`;
    })
    .join("");
}

function render(app: HTMLElement): void {
  const t = today();
  const rows = state.rows;
  const ok = rows.filter((r) => r.status === "SUCCESS").length;
  const rate = rows.length ? `${Math.round((ok / rows.length) * 1000) / 10}%` : "—";
  const runsToday = rows.filter((r) => r.timestamp.startsWith(t)).length;
  const failToday = rows.filter((r) => r.timestamp.startsWith(t) && r.status === "FAILURE").length;
  const open = Math.max(0, 1);

  app.innerHTML = `<main class="wrap">
    <header class="top">
      <div>
        <h1>AI Company – Virtual Office</h1>
        <p class="muted">Automated employee operations &amp; Discord dispatcher</p>
      </div>
      <p class="mono muted pill">Last run: ${esc(rows[0]?.timestamp ?? "—")} (${TZ})</p>
    </header>

    <section class="stats">
      ${statCard("Total employees", String(state.agents.length), `${open} open desk`)}
      ${statCard("Runs today", String(runsToday), "Logged in the Sheet")}
      ${statCard("Success rate", rate, "All logged runs")}
      ${statCard("Failures today", String(failToday), failToday ? "Check the log below" : "All clear")}
    </section>

    <h2>Employees <span class="muted">/ ພະນັກງານ</span></h2>
    <section class="grid">
      ${state.agents.map(agentCard).join("")}
      <article class="card vacancy"><p class="plus">+</p><h3>Vacant desk</h3>
        <p class="muted">Add an entry to <code>public/data/agents.json</code> to hire a new AI employee.</p></article>
    </section>

    <section class="card feed-box">
      <div class="feed-head">
        <h2>Activity feed <span class="muted">/ ບັນທຶກການເຮັດວຽກ</span></h2>
        <input id="q" type="search" placeholder="Search logs…" />
        <div class="seg" id="seg">
          <button data-f="ALL" class="on">All</button>
          <button data-f="SUCCESS">Success</button>
          <button data-f="FAILURE">Failed</button>
        </div>
      </div>
      <div id="feed">${feedHtml()}</div>
    </section>
  </main>`;

  const feed = app.querySelector<HTMLElement>("#feed");
  const seg = app.querySelector<HTMLElement>("#seg");
  const q = app.querySelector<HTMLInputElement>("#q");
  if (!feed || !seg || !q) return;

  q.addEventListener("input", () => {
    state.q = q.value;
    feed.innerHTML = feedHtml();
  });
  seg.addEventListener("click", (e) => {
    const f = (e.target as HTMLElement).dataset["f"] as Filter | undefined;
    if (!f) return;
    state.filter = f;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset["f"] === f));
    feed.innerHTML = feedHtml();
  });
  feed.addEventListener("click", (e) => {
    (e.target as HTMLElement).closest(".feed-row")?.classList.toggle("open");
  });
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;
  try {
    const [agents, rows] = await Promise.all([load<Agent[]>("agents.json"), load<LogRow[]>("log.json")]);
    state.agents = agents;
    state.rows = [...rows].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    render(app);
  } catch (e) {
    app.innerHTML = `<p class="empty">Could not load data: ${esc(String(e))}</p>`;
  }
}

void main();