import { supabase } from "../supabase";

interface InboxRow {
  id: string;
  agent: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

// agent ທີ່ໜ້ານີ້ສະແດງລາຍງານ (ຕ້ອງກົງກັບຄໍລຳ agent ໃນຕາຕະລາງ inbox)
const AGENT_ID = "class-agent";
const TZ = "Asia/Vientiane";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const fmt = (iso: string): string => new Date(iso).toLocaleString("sv-SE", { timeZone: TZ });

async function loadRows(): Promise<InboxRow[]> {
  const { data, error } = await supabase
    .from("inbox")
    .select("id, agent, title, body, read_at, created_at")
    .eq("agent", AGENT_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data as InboxRow[];
}

function listHtml(rows: InboxRow[]): string {
  if (rows.length === 0) {
    return `<div class="empty"><p class="emoji">📭</p><p>ຍັງບໍ່ມີລາຍງານ</p></div>`;
  }
  return rows
    .map((r) => {
      const unread = r.read_at === null;
      const mark = unread ? `<button class="pill read" data-id="${r.id}">ໝາຍວ່າອ່ານແລ້ວ</button>` : "";
      const body = r.body ? `<p style="white-space:pre-wrap;margin-top:8px">${esc(r.body)}</p>` : "";
      return `<div class="day">
        <div class="between">
          <h3>${esc(r.title)}</h3>
          ${unread ? `<span class="badge ok">ໃໝ່</span>` : ""}
        </div>
        <p class="mono muted">${esc(fmt(r.created_at))}</p>
        ${body}
        <div class="row" style="margin-top:8px">${mark}</div>
      </div>`;
    })
    .join("");
}

export async function mountAgent(app: HTMLElement): Promise<void> {
  app.innerHTML = `<main class="wrap">
    <header class="top">
      <div><h1>class_ai</h1><p class="muted">ລາຍງານຈາກຜູ້ຊ່ວຍຕາຕະລາງຮຽນ</p></div>
      <div class="row">
        <a class="pill" href="#/class">ຕາຕະລາງຮຽນ</a>
        <a class="pill" href="#/">← ກັບໜ້າຫຼັກ</a>
      </div>
    </header>
    <section class="card" id="list" style="margin-top:24px"><p class="muted">ກຳລັງໂຫຼດ…</p></section>
    <p id="err" class="err" role="alert"></p>
  </main>`;

  const list = app.querySelector<HTMLElement>("#list");
  const err = app.querySelector<HTMLElement>("#err");
  if (!list || !err) return;

  const refresh = async (): Promise<void> => {
    try {
      list.innerHTML = listHtml(await loadRows());
    } catch (e) {
      list.innerHTML = `<p class="err">ໂຫຼດບໍ່ໄດ້: ${esc(e instanceof Error ? e.message : String(e))}</p>`;
    }
  };

  list.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>(".read")?.dataset["id"];
    if (!id) return;
    void (async () => {
      err.textContent = "";
      const { error } = await supabase
        .from("inbox")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) err.textContent = error.message;
      await refresh();
    })();
  });

  await refresh();
}