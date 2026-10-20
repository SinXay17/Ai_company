import { supabase } from "../supabase";

interface ClassRow {
  id: string;
  day_of_week: number;
  subject: string;
  location: string | null;
  start_time: string;
  end_time: string | null;
}

const DAYS = ["", "ຈັນ", "ອັງຄານ", "ພຸດ", "ພະຫັດ", "ສຸກ", "ເສົາ", "ອາທິດ"];

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const hhmm = (t: string): string => t.slice(0, 5);

async function loadRows(): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from("class_schedule")
    .select("id, day_of_week, subject, location, start_time, end_time")
    .order("day_of_week")
    .order("start_time");
  if (error) throw new Error(error.message);
  return data as ClassRow[];
}

function listHtml(rows: ClassRow[]): string {
  if (rows.length === 0) return `<p class="muted">ຍັງບໍ່ມີຕາຕະລາງຮຽນ ເພີ່ມທາງເທິງໄດ້ເລີຍ</p>`;
  return [1, 2, 3, 4, 5, 6, 7]
    .map((d) => {
      const items = rows.filter((r) => r.day_of_week === d);
      if (items.length === 0) return "";
      const lines = items
        .map(
          (r) => `<div class="sched-row">
            <span class="mono">${hhmm(r.start_time)}${r.end_time ? "–" + hhmm(r.end_time) : ""}</span>
            <span class="msg"><strong>${esc(r.subject)}</strong>${r.location ? ` (${esc(r.location)})` : ""}</span>
            <button class="pill del" data-id="${r.id}">ລຶບ</button>
          </div>`,
        )
        .join("");
      return `<div class="day"><h3>${DAYS[d]}</h3>${lines}</div>`;
    })
    .join("");
}

export async function mountClass(app: HTMLElement): Promise<void> {
  app.innerHTML = `<main class="wrap">
    <header class="top">
      <div><h1>class_ai</h1><p class="muted">ຕາຕະລາງຮຽນປະຈຳອາທິດ</p></div>
      <a class="pill" href="#/">← ກັບໜ້າຫຼັກ</a>
    </header>
    <section class="card form">
      <h2>ເພີ່ມຄາບຮຽນ</h2>
      <div class="form-grid">
        <label>ວັນ
          <select id="day">${DAYS.slice(1).map((n, i) => `<option value="${i + 1}">${n}</option>`).join("")}</select>
        </label>
        <label>ວິຊາ<input id="subject" type="text" placeholder="ເຊັ່ນ Java II" /></label>
        <label>ສະຖານທີ່<input id="location" type="text" placeholder="ເຊັ່ນ ຫ້ອງ 307" /></label>
        <label>ເລີ່ມ<input id="start" type="time" /></label>
        <label>ຈົບ<input id="end" type="time" /></label>
      </div>
      <button id="add" class="primary">ເພີ່ມ</button>
      <p id="err" class="err" role="alert"></p>
    </section>
    <section class="card" id="list"><p class="muted">ກຳລັງໂຫຼດ…</p></section>
  </main>`;

  const q = <T extends HTMLElement>(sel: string): T | null => app.querySelector<T>(sel);
  const list = q<HTMLElement>("#list");
  const err = q<HTMLElement>("#err");
  const add = q<HTMLButtonElement>("#add");
  const day = q<HTMLSelectElement>("#day");
  const subject = q<HTMLInputElement>("#subject");
  const location_ = q<HTMLInputElement>("#location");
  const start = q<HTMLInputElement>("#start");
  const end = q<HTMLInputElement>("#end");
  if (!list || !err || !add || !day || !subject || !location_ || !start || !end) return;

  const refresh = async (): Promise<void> => {
    try {
      list.innerHTML = listHtml(await loadRows());
    } catch (e) {
      list.innerHTML = `<p class="err">ໂຫຼດບໍ່ໄດ້: ${esc(e instanceof Error ? e.message : String(e))}</p>`;
    }
  };

  add.addEventListener("click", () => {
    void (async () => {
      err.textContent = "";
      if (!subject.value.trim() || !start.value) {
        err.textContent = "ກະລຸນາໃສ່ວິຊາ ແລະ ເວລາເລີ່ມ";
        return;
      }
      if (end.value && end.value <= start.value) {
        err.textContent = "ເວລາຈົບຕ້ອງຫຼັງເວລາເລີ່ມ";
        return;
      }
      add.disabled = true;
      const { error } = await supabase.from("class_schedule").insert({
        day_of_week: Number(day.value),
        subject: subject.value.trim(),
        location: location_.value.trim() || null,
        start_time: start.value,
        end_time: end.value || null,
      });
      add.disabled = false;
      if (error) {
        err.textContent = error.message;
        return;
      }
      subject.value = "";
      location_.value = "";
      await refresh();
    })();
  });

  list.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>(".del")?.dataset["id"];
    if (!id) return;
    void (async () => {
      const { error } = await supabase.from("class_schedule").delete().eq("id", id);
      if (error) err.textContent = error.message;
      await refresh();
    })();
  });

  await refresh();
}