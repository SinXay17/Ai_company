import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LOG_SHEET_ID = process.env.LOG_SHEET_ID;

type RunStatus = "SUCCESS" | "FAILURE";

type ClassRow = {
  subject: string;
  location: string | null;
  start_time: string;
  end_time: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ຫາມື້ໃນອາທິດຕາມເວລາລາວ (1=ຈັນ ... 7=ອາທິດ)
function laosDayOfWeek(): number {
  const offset = 7 * 60 * 60 * 1000;
  const day = new Date(Date.now() + offset).getUTCDay();
  return day === 0 ? 7 : day;
}

// ຕັດ "08:30:00" ໃຫ້ເຫຼືອ "08:30"
function formatTime(time: string): string {
  return time.slice(0, 5);
}

async function getTodayClasses(): Promise<ClassRow[]> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("ຂາດ SUPABASE_URL ຫຼື SUPABASE_SECRET_KEY ໃນ environment");
  }

  // ໃຊ້ secret key ສະເພາະຝັ່ງ agent ເທົ່ານັ້ນ
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("class_schedule")
    .select("subject, location, start_time, end_time")
    .eq("day_of_week", laosDayOfWeek())
    .order("start_time", { ascending: true });

  if (error) throw new Error(`ດຶງຕາຕະລາງຈາກ Supabase ບໍ່ສຳເລັດ: ${error.message}`);
  return (data ?? []) as ClassRow[];
}

async function sendToDiscord(message: string): Promise<void> {
  if (!WEBHOOK_URL) throw new Error("ຂາດ DISCORD_WEBHOOK_URL ໃນ environment");

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!response.ok) throw new Error(`ສົ່ງເຂົ້າ Discord ບໍ່ສຳເລັດ: ${response.status}`);
}

async function logRun(status: RunStatus, detail: string): Promise<void> {
  if (!SERVICE_ACCOUNT_KEY || !LOG_SHEET_ID) {
    throw new Error("ຂາດ GOOGLE_SERVICE_ACCOUNT_KEY ຫຼື LOG_SHEET_ID ສຳລັບບັນທຶກຜົນ");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(SERVICE_ACCOUNT_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: LOG_SHEET_ID,
    fields: "sheets(properties(title))",
  });
  const sheetTitle = spreadsheet.sheets?.[0]?.properties?.title;
  if (!sheetTitle) throw new Error("ບໍ່ພົບແທັບໃນ Google Sheet");

  const timestamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Vientiane",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

  await sheets.spreadsheets.values.append({
    spreadsheetId: LOG_SHEET_ID,
    range: `'${sheetTitle.replace(/'/g, "''")}'!A:D`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[timestamp, "class-agent", status, detail.slice(0, 1000)]],
    },
  });
}

async function main(): Promise<void> {
  let status: RunStatus = "SUCCESS";
  let detail = "";
  let failure: unknown;

  try {
    if (!WEBHOOK_URL) {
      throw new Error("ຂາດ DISCORD_WEBHOOK_URL ໃນ environment");
    }

    const classes = await getTodayClasses();
    let message: string;
    if (classes.length === 0) {
      message = "🎉 ມື້ນີ້ບໍ່ມີຄາບຮຽນ";
    } else {
      const lines = classes.map((item) => {
        const room = item.location ? ` (${item.location})` : "";
        return `🕒 ${formatTime(item.start_time)} - ${item.subject}${room}`;
      });
      message = `📚 ຕາຕະລາງຮຽນມື້ນີ້\n${lines.join("\n")}`;
    }

    await sendToDiscord(message);
    detail = message;
    console.log("ສົ່ງສຳເລັດ:\n" + message);
  } catch (error: unknown) {
    status = "FAILURE";
    detail = errorMessage(error);
    failure = error;
    console.error("Agent ເຮັດວຽກລົ້ມເຫຼວ:", detail);
  }

  try {
    await logRun(status, detail);
    console.log("ບັນທຶກຜົນລົງ Google Sheets ສຳເລັດ");
  } catch (error: unknown) {
    console.error("ບັນທຶກຜົນລົງ Google Sheets ບໍ່ສຳເລັດ:", errorMessage(error));
    failure ||= error;
  }

  if (failure) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Agent ເຮັດວຽກລົ້ມເຫຼວ:", errorMessage(error));
  process.exitCode = 1;
});