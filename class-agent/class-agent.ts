import { google } from "googleapis";

const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LOG_SHEET_ID = process.env.LOG_SHEET_ID;

type RunStatus = "SUCCESS" | "FAILURE";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function laosDayRange(): { start: Date; end: Date } {
  const offset = 7 * 60 * 60 * 1000;
  const laosNow = new Date(Date.now() + offset);
  const year = laosNow.getUTCFullYear();
  const month = laosNow.getUTCMonth();
  const day = laosNow.getUTCDate();
  const start = new Date(Date.UTC(year, month, day, 0, 0, 0) - offset);
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59) - offset);
  return { start, end };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("lo-LA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Vientiane",
  });
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
    if (!SERVICE_ACCOUNT_KEY || !CALENDAR_ID || !WEBHOOK_URL) {
      throw new Error("ຂາດ GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID ຫຼື DISCORD_WEBHOOK_URL");
    }

    const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    const calendar = google.calendar({ version: "v3", auth });
    const { start, end } = laosDayRange();
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items ?? [];
    let message: string;
    if (events.length === 0) {
      message = "🎉 ມື້ນີ້ບໍ່ມີຄາບຮຽນ";
    } else {
      const lines = events.map((event) => {
        const time = event.start?.dateTime ? formatTime(event.start.dateTime) : "ຕະຫຼອດມື້";
        const room = event.location ? ` (${event.location})` : "";
        return `🕒 ${time} - ${event.summary ?? "(ບໍ່ມີຫົວຂໍ້)"}${room}`;
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