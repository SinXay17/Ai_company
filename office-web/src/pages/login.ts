import { signIn } from "../auth";

export function mountLogin(app: HTMLElement): void {
  app.innerHTML = `<main class="wrap narrow">
    <section class="card login">
      <h1>ເຂົ້າສູ່ລະບົບ</h1>
      <p class="muted">ສະເພາະເຈົ້າຂອງ AI Company</p>
      <label>ອີເມວ<input id="email" type="email" autocomplete="username" /></label>
      <label>ລະຫັດຜ່ານ<input id="password" type="password" autocomplete="current-password" /></label>
      <button id="go" class="primary">ເຂົ້າສູ່ລະບົບ</button>
      <p id="err" class="err" role="alert"></p>
    </section>
  </main>`;

  const email = app.querySelector<HTMLInputElement>("#email");
  const password = app.querySelector<HTMLInputElement>("#password");
  const go = app.querySelector<HTMLButtonElement>("#go");
  const err = app.querySelector<HTMLElement>("#err");
  if (!email || !password || !go || !err) return;

  const submit = async (): Promise<void> => {
    err.textContent = "";
    go.disabled = true;
    try {
      await signIn(email.value.trim(), password.value);
      location.hash = "#/";
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      go.disabled = false;
    }
  };

  go.addEventListener("click", () => void submit());
  password.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submit();
  });
}