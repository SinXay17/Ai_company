import "./style.css";
import type { Agent, LogRow, RunStatus } from "./types";

const FEED_LIMIT = 30;

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`โหลด ${file} ไม่ได้ (${response.status})`);
  return (await response.json()) as T;
}

function isStatus(value: unknown): value is RunStatus {
  return value === "SUCCESS" || value === "FAILURE";
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // ใช้ textContent เสมอ — ข้อความใน log มาจากภายนอก ห้ามใส่เป็น HTML
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusPill(status: RunStatus): HTMLSpanElement {
  const ok = status === "SUCCESS";
  return el("span", `pill ${ok ? "ok" : "fail"}`, ok ? "✓ สำเร็จ" : "✕ ล้มเหลว");
}

function renderStats(root: HTMLElement, rows: LogRow[]): void {
  const total = rows.length;
  const failed = rows.filter((r) => r.status === "FAILURE").length;
  const rate = total === 0 ? "–" : `${(((total - failed) / total) * 100).toFixed(0)}%`;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Vientiane" });
  const todayRuns = rows.filter((r) => r.timestamp.startsWith(today)).length;

  const items: Array<[string, string]> = [
    ["รันทั้งหมด", String(total)],
    ["สำเร็จ", rate],
    ["ล้มเหลว", String(failed)],
    ["รันวันนี้", String(todayRuns)],
  ];
  root.replaceChildren(
    ...items.map(([label, value]) => {
      const box = el("div", "stat");
      box.append(el("strong", undefined, value), el("span", undefined, label));
      return box;
    }),
  );
}

function renderDesks(root: HTMLElement, agents: Agent[], rows: LogRow[]): void {
  const cards = agents.map((agent) => {
    const mine = rows.filter((r) => r.agent === agent.id);
    const latest = mine[0];

    const card = el("article", "desk");
    const head = el("div", "desk-head");
    head.append(el("span", "avatar", agent.emoji));
    const who = el("div");
    who.append(el("h3", undefined, agent.name), el("p", "role", agent.role));
    head.append(who);

    const meta = el("p", "meta", `ทำงาน ${agent.schedule} · ${mine.length} รอบ`);
    card.append(head, meta);

    if (latest) {
      card.append(statusPill(latest.status), el("p", "when", latest.timestamp));
      card.append(el("p", "snippet", latest.message));
    } else {
      card.append(el("p", "when", "ยังไม่เคยรายงานงาน"));
    }
    return card;
  });

  const vacant = el("article", "desk vacant");
  vacant.append(
    el("span", "avatar", "＋"),
    el("h3", undefined, "ตำแหน่งว่าง"),
    el("p", "meta", "เพิ่มพนักงานใหม่ใน agents.json"),
  );

  root.replaceChildren(...cards, vacant);
}

function renderFeed(root: HTMLElement, agents: Agent[], rows: LogRow[]): void {
  const byId = new Map(agents.map((a) => [a.id, a]));
  if (rows.length === 0) {
    root.replaceChildren(el("li", "empty", "ยังไม่มีกิจกรรม — รอรอบรันแรกของ agent"));
    return;
  }
  root.replaceChildren(
    ...rows.slice(0, FEED_LIMIT).map((row) => {
      const agent = byId.get(row.agent);
      const item = el("li", `feed-item ${row.status === "FAILURE" ? "is-fail" : ""}`);
      const top = el("div", "feed-top");
      top.append(
        el("strong", undefined, `${agent?.emoji ?? "🤖"} ${agent?.name ?? row.agent}`),
        statusPill(row.status),
        el("time", undefined, row.timestamp),
      );
      item.append(top, el("p", "feed-msg", row.message));
      return item;
    }),
  );
}

async function main(): Promise<void> {
  const subtitle = document.getElementById("subtitle")!;
  try {
    const [agents, rawRows] = await Promise.all([
      loadJson<Agent[]>("agents.json"),
      loadJson<LogRow[]>("log.json"),
    ]);
    // ใหม่สุดก่อน (timestamp เป็น "YYYY-MM-DD HH:mm:ss" เทียบเป็น string ได้)
    const rows = rawRows
      .filter((r) => isStatus(r.status))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    subtitle.textContent = `พนักงาน AI ${agents.length} คน`;
    renderStats(document.getElementById("stats")!, rows);
    renderDesks(document.getElementById("desks")!, agents, rows);
    renderFeed(document.getElementById("feed")!, agents, rows);
  } catch (error: unknown) {
    subtitle.textContent = `โหลดข้อมูลไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`;
  }
}

void main();