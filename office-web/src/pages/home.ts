import { signOut } from "../auth";

interface AiCard {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  href: string | null;
}

const CARDS: AiCard[] = [
  { id: "class_ai", emoji: "📚", name: "class_ai", desc: "ຜູ້ຊ່ວຍຕາຕະລາງຮຽນ", href: "#/class" },
  { id: "stock_ai", emoji: "📈", name: "stock_ai", desc: "ຜູ້ຊ່ວຍຕິດຕາມຫຸ້ນ (ໄວໆນີ້)", href: null },
];

export function mountHome(app: HTMLElement): void {
  const cards = CARDS.map((c) => {
    const inner = `<div class="avatar">${c.emoji}</div>
      <div><h3>${c.name}</h3><p class="muted">${c.desc}</p></div>`;
    return c.href
      ? `<a class="card agent clickable" href="${c.href}">${inner}</a>`
      : `<article class="card agent disabled">${inner}</article>`;
  }).join("");

  app.innerHTML = `<main class="wrap">
    <header class="top">
      <div>
        <h1>AI Company</h1>
        <p class="muted">ເລືອກພະນັກງານ AI</p>
      </div>
      <div class="row">
        <a class="pill" href="#/log">📋 ບັນທຶກການເຮັດວຽກ</a>
        <button id="out" class="pill">ອອກຈາກລະບົບ</button>
      </div>
    </header>
    <section class="grid">${cards}</section>
  </main>`;

  app.querySelector<HTMLButtonElement>("#out")?.addEventListener("click", () => {
    void signOut();
  });
}