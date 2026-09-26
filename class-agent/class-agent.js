const { google } = require("googleapis");

const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LOG_SHEET_ID = process.env.LOG_SHEET_ID;

function laosDayRange() {
  const OFFSET = 7 * 60 * 60 * 1000;
  const laosNow = new Date(Date.now() + OFFSET);
  const y = laosNow.getUTCFullYear();
  const m = laosNow.getUTCMonth();
  const d = laosNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0) - OFFSET);
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59) - OFFSET);
  return { start, end };
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("lo-LA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Vientiane",
  });
}

async function sendToDiscord(message) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`ສົ່ງເຂົ້າ Discord ບໍ່ສຳເລັດ: ${res.status}`);
}

async function logRun(status, detail) {
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

async function main() {
  let status = "SUCCESS";
  let detail = "";
  let failure;

  try {
    if (!SERVICE_ACCOUNT_KEY || !CALENDAR_ID || !WEBHOOK_URL) {
      throw new Error("ຂາດ GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID ຫຼື DISCORD_WEBHOOK_URL");
    }

    const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    const authClient = await auth.getClient();

    const calendar = google.calendar({ version: "v3", auth: authClient });
    const { start, end } = laosDayRange();

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items || [];

    let message;
    if (events.length === 0) {
      message = "🎉 ມື້ນີ້ບໍ່ມີຄາບຮຽນ";
    } else {
      const lines = events.map((e) => {
        const time = e.start.dateTime ? formatTime(e.start.dateTime) : "ຕະຫຼອດມື້";
        const room = e.location ? ` (${e.location})` : "";
        return `🕒 ${time} - ${e.summary}${room}`;
      });
      message = `📚 ຕາຕະລາງຮຽນມື້ນີ້\n${lines.join("\n")}`;
    }

    await sendToDiscord(message);
    detail = `Discord message sent; events=${events.length}`;
    console.log("ສົ່ງສຳເລັດ:\n" + message);
  } catch (err) {
    status = "FAILURE";
    detail = err.message || String(err);
    failure = err;
    console.error("Agent ເຮັດວຽກລົ້ມເຫຼວ:", detail);
  }

  try {
    await logRun(status, detail);
    console.log("ບັນທຶກຜົນລົງ Google Sheets ສຳເລັດ");
  } catch (err) {
    console.error("ບັນທຶກຜົນລົງ Google Sheets ບໍ່ສຳເລັດ:", err.message);
    failure ||= err;
  }

  if (failure) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Agent ເຮັດວຽກລົ້ມເຫຼວ:", err.message);
  process.exitCode = 1;
});