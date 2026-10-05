import "./style.css";
import type { Agent, LogRow, RunStatus } from "./types";

const FEED_LIMIT = 30;

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`ໂຫຼດ ${file} ບໍ່ສຳເລັດ (${response.status})`);
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
  // ໃຊ້ textContent ສະເໝີ ເພາະຂໍ້ຄວາມຈາກບັນທຶກມາຈາກພາຍນອກ
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusPill(status: RunStatus): HTMLSpanElement {
  const ok = status === "SUCCESS";
  return el("span", `pill ${ok ? "ok" : "fail"}`, ok ? "✓ ສຳເລັດ" : "✕ ລົ້ມເຫຼວ");
}

function renderStats(root: HTMLElement, rows: LogRow[]): void {
  const total = rows.length;
  const failed = rows.filter((r) => r.status === "FAILURE").length;
  const rate = total === 0 ? "–" : `${(((total - failed) / total) * 100).toFixed(0)}%`;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Vientiane" });
  const todayRuns = rows.filter((r) => r.timestamp.startsWith(today)).length;

  const items: Array<[string, string]> = [
    ["ຈຳນວນການເຮັດວຽກ", String(total)],
    ["ອັດຕາສຳເລັດ", rate],
    ["ລົ້ມເຫຼວ", String(failed)],
    ["ເຮັດວຽກມື້ນີ້", String(todayRuns)],
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

    const meta = el("p", "meta", `ເຮັດວຽກ ${agent.schedule} · ${mine.length} ຄັ້ງ`);
    card.append(head, meta);

    if (latest) {
      card.append(statusPill(latest.status), el("p", "when", formatTimestamp(latest.timestamp)));
      card.append(el("p", "snippet", latest.message));
    } else {
      card.append(el("p", "when", "ຍັງບໍ່ມີລາຍງານ"));
    }
    return card;
  });

  const vacant = el("article", "desk vacant");
  vacant.append(
    el("span", "avatar", "＋"),
    el("h3", undefined, "ຕຳແໜ່ງວ່າງ"),
    el("p", "meta", "ເພີ່ມພະນັກງານໃໝ່ໃນໄຟລ໌ລາຍຊື່ພະນັກງານ"),
  );

  root.replaceChildren(...cards, vacant);
}

function renderFeed(root: HTMLElement, agents: Agent[], rows: LogRow[]): void {
  const byId = new Map(agents.map((a) => [a.id, a]));
  if (rows.length === 0) {
    root.replaceChildren(el("li", "empty", "ຍັງບໍ່ມີກິດຈະກຳ — ລໍຖ້າການເຮັດວຽກຄັ້ງທຳອິດ"));
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
        el("time", undefined, formatTimestamp(row.timestamp)),
      );
      item.append(top, el("p", "feed-msg", row.message));
      return item;
    }),
  );
}

function formatTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}+07:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Vientiane",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const months = [
    "ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
    "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
  ];
  const month = Number(values.month);
  return `${values.day} ${months[month - 1]} ${values.year} · ${values.hour}:${values.minute}`;
}

async function main(): Promise<void> {
  const subtitle = document.getElementById("subtitle")!;
  try {
    const [agents, rawRows] = await Promise.all([
      loadJson<Agent[]>("agents.json"),
      loadJson<LogRow[]>("log.json"),
    ]);
    // ຈັດລຽງລາຍການໃໝ່ສຸດໄວ້ກ່ອນ
    const rows = rawRows
      .filter((r) => isStatus(r.status))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    subtitle.textContent = `ພະນັກງານ AI ${agents.length} ຄົນ`;
    renderStats(document.getElementById("stats")!, rows);
    renderDesks(document.getElementById("desks")!, agents, rows);
    renderFeed(document.getElementById("feed")!, agents, rows);
  } catch (error: unknown) {
    subtitle.textContent = `ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ: ${error instanceof Error ? error.message : String(error)}`;
  }
}

void main();