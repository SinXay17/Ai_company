const { google } = require("googleapis");

const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!SERVICE_ACCOUNT_KEY || !CALENDAR_ID || !WEBHOOK_URL) {
  console.error("ขาด GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID หรือ DISCORD_WEBHOOK_URL");
  process.exit(1);
}

function bangkokDayRange() {
  const OFFSET = 7 * 60 * 60 * 1000;
  const bkkNow = new Date(Date.now() + OFFSET);
  const y = bkkNow.getUTCFullYear();
  const m = bkkNow.getUTCMonth();
  const d = bkkNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0) - OFFSET);
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59) - OFFSET);
  return { start, end };
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

async function sendToDiscord(message) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`ส่งเข้า Discord ไม่สำเร็จ: ${res.status}`);
}

async function main() {
  const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/calendar.readonly"]
  );

  const calendar = google.calendar({ version: "v3", auth });
  const { start, end } = bangkokDayRange();

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
    message = "🎉 วันนี้ไม่มีคาบเรียนครับ";
  } else {
    const lines = events.map((e) => {
      const time = e.start.dateTime ? formatTime(e.start.dateTime) : "ทั้งวัน";
      const room = e.location ? ` (ห้อง ${e.location})` : "";
      return `🕒 ${time} - ${e.summary}${room}`;
    });
    message = `📚 ตารางเรียนวันนี้\n${lines.join("\n")}`;
  }

  await sendToDiscord(message);
  console.log("ส่งสำเร็จ:\n" + message);
}

main().catch((err) => {
  console.error("Agent ทำงานล้มเหลว:", err.message);
  process.exit(1);
});