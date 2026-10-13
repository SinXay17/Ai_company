/// <reference types="vite/client" />
import "./style.css";
import { getSession, onAuthChange } from "./auth";
import { mountLogPage } from "./log-page";
import { mountHome } from "./pages/home";
import { mountClass } from "./pages/class";
import { mountLogin } from "./pages/login";

const app = document.getElementById("app");

async function route(): Promise<void> {
  if (!app) return;
  const session = await getSession();
  const path = location.hash.replace(/^#/, "") || "/";

  // ໜ້າ log ເປັນສາທາລະນະ (ຂໍ້ມູນຢູ່ໃນ log.json ຢູ່ແລ້ວ)
  if (path === "/log") {
    await mountLogPage(app);
    return;
  }
  // ໜ້າອື່ນຕ້ອງ login ກ່ອນ
  if (!session) {
    mountLogin(app);
    return;
  }
    if (path === "/class") {
    await mountClass(app);
    return;
  }
  mountHome(app);
}

window.addEventListener("hashchange", () => void route());
onAuthChange(() => void route());
void route();