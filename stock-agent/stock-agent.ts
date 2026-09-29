import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const API_KEY = process.env.STOCK_API_KEY;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const LOG_SHEET_ID = process.env.LOG_SHEET_ID;
const PRICE_FILE = path.join(__dirname, "data", "price.json");

type RunStatus = "SUCCESS" | "FAILURE";
type PriceMap = Record<string, number>;

const TICKERS = ["NVDA"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPriceMap(value: unknown): value is PriceMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((price) => typeof price === "number" && Number.isFinite(price))
  );
}

async function getPrice(ticker: string): Promise<number> {
  if (!API_KEY) throw new Error("ຂາດ STOCK_API_KEY ໃນ environment");

  const response = await fetch(
    `https://api.api-ninjas.com/v1/stockprice?ticker=${ticker}`,
    { headers: { "X-Api-Key": API_KEY } },
  );
  if (!response.ok) throw new Error(`API Ninjas error ສຳລັບ ${ticker}: ${response.status}`);

  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("price" in data) ||
    typeof data.price !== "number" ||
    !Number.isFinite(data.price)
  ) {
    throw new Error(`API Ninjas ສົ່ງລາຄາບໍ່ຖືກຕ້ອງສຳລັບ ${ticker}`);
  }
  return data.price;
}

function loadPreviousPrices(): PriceMap {
  if (!fs.existsSync(PRICE_FILE)) return {};

  const parsed: unknown = JSON.parse(fs.readFileSync(PRICE_FILE, "utf-8"));
  if (!isPriceMap(parsed)) throw new Error("ຂໍ້ມູນໃນ price.json ບໍ່ຖືກຕ້ອງ");
  return parsed;
}

function savePrices(prices: PriceMap): void {
  fs.mkdirSync(path.dirname(PRICE_FILE), { recursive: true });
  fs.writeFileSync(PRICE_FILE, JSON.stringify(prices, null, 2), "utf-8");
}

async function sendToDiscord(message: string): Promise<void> {
  if (!WEBHOOK_URL) throw new Error("ຂາດ DISCORD_WEBHOOK_URL ໃນ environment");

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!response.ok) {
    throw new Error(`ສົ່ງເຂົ້າ Discord ບໍ່ສຳເລັດ: ${response.status}`);
  }
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
      values: [[timestamp, "stock-agent", status, detail.slice(0, 1000)]],
    },
  });
}

function formatLine(ticker: string, current: number, previous: number | undefined): string {
  const price = `$${current.toFixed(2)}`;
  if (previous === undefined) {
    return `${ticker}: ${price} (ຍັງບໍ່ມີຂໍ້ມູນມື້ວານ ຈະປຽບທຽບໄດ້ຕັ້ງແຕ່ມື້ອື່ນ)`;
  }

  const difference = current - previous;
  const percent = (difference / previous) * 100;
  const arrow = difference >= 0 ? "📈" : "📉";
  const sign = difference >= 0 ? "+" : "";
  return `${ticker}: ${price} (${sign}${percent.toFixed(2)}% ຈາກມື້ວານ) ${arrow}`;
}

async function main(): Promise<void> {
  let status: RunStatus = "SUCCESS";
  let detail = "";
  let failure: unknown;

  try {
    if (!API_KEY || !WEBHOOK_URL) {
      throw new Error("ຂາດ STOCK_API_KEY ຫຼື DISCORD_WEBHOOK_URL ໃນ environment");
    }

    const previousPrices = loadPreviousPrices();
    const newPrices: PriceMap = {};
    const lines: string[] = [];

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