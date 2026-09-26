// stock-agent.js
// Agent 2: ດຶງລາຄາຫຸ້ນ -> ປຽບທຽບກັບມື້ວານ -> ສົ່ງເຂົ້າ Discord

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const API_KEY = process.env.STOCK_API_KEY;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const LOG_SHEET_ID = process.env.LOG_SHEET_ID;
const PRICE_FILE = path.join(__dirname, "data", "price.json");

// ຕັ້ງ ticker ທີ່ຕ້ອງການຕິດຕາມ ແກ້ໄຂບ່ອນນີ້ເພື່ອເພີ່ມ/ຫຼຸດຫຸ້ນໄດ້
const TICKERS = ["NVDA"];

async function getPrice(ticker) {
  const res = await fetch(
    `https://api.api-ninjas.com/v1/stockprice?ticker=${ticker}`,
    { headers: { "X-Api-Key": API_KEY } }
  );
  if (!res.ok) {
    throw new Error(`API Ninjas error ສຳລັບ ${ticker}: ${res.status}`);
  }
  const data = await res.json();
  return data.price;
}

function loadPreviousPrices() {
  if (!fs.existsSync(PRICE_FILE)) return {};
  return JSON.parse(fs.readFileSync(PRICE_FILE, "utf-8"));
}

function savePrices(prices) {
  fs.mkdirSync(path.dirname(PRICE_FILE), { recursive: true });
  fs.writeFileSync(PRICE_FILE, JSON.stringify(prices, null, 2), "utf-8");
}

async function sendToDiscord(message) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) {
    throw new Error(`ສົ່ງເຂົ້າ Discord ບໍ່ສຳເລັດ: ${res.status}`);
  }
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
      values: [[timestamp, "stock-agent", status, detail.slice(0, 1000)]],
    },
  });
}

function formatLine(ticker, current, previous) {
  const price = `$${current.toFixed(2)}`;
  if (previous === undefined) {
    // ແລ່ນຄັ້ງທຳອິດ ຍັງບໍ່ມີລາຄາຂອງມື້ວານໃຫ້ປຽບທຽບ
    return `${ticker}: ${price} (ຍັງບໍ່ມີຂໍ້ມູນມື້ວານ ຈະປຽບທຽບໄດ້ຕັ້ງແຕ່ມື້ອື່ນ)`;
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  const arrow = diff >= 0 ? "📈" : "📉";
  const sign = diff >= 0 ? "+" : "";
  return `${ticker}: ${price} (${sign}${pct.toFixed(2)}% ຈາກມື້ວານ) ${arrow}`;
}

async function main() {
  let status = "SUCCESS";
  let detail = "";
  let failure;

  try {
    if (!API_KEY || !WEBHOOK_URL) {
      throw new Error("ຂາດ STOCK_API_KEY ຫຼື DISCORD_WEBHOOK_URL ໃນ environment");
    }

    const previousPrices = loadPreviousPrices();
    const newPrices = {};
    const lines = [];

    for (const ticker of TICKERS) {
      const current = await getPrice(ticker);
      lines.push(formatLine(ticker, current, previousPrices[ticker]));
      newPrices[ticker] = current;
    }

    const message = `📊 ສະຫຼຸບຫຸ້ນປະຈຳວັນນີ້\n${lines.join("\n")}`;
    await sendToDiscord(message);
    savePrices(newPrices);

    detail = message;
    console.log("ສົ່ງສຳເລັດ:", message);
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