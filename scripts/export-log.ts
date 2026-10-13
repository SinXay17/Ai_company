import { google } from "googleapis";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type RunStatus = "SUCCESS" | "FAILURE";

interface LogRow {
  timestamp: string;
  agent: string;
  status: RunStatus;
  message: string;
}

const OUTPUT_FILE = path.resolve("office-web/public/data/log.json");
const MAX_ROWS = 200;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// รองรับทั้ง JSON ตรง ๆ และ JSON ที่เข้ารหัส base64
function parseCredentials(raw: string): { client_email: string; private_key: string } {
  const text = raw.trim();
  const json = text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8");
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("client_email" in value) ||
    typeof value.client_email !== "string" ||
    !("private_key" in value) ||
    typeof value.private_key !== "string"
  ) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must contain client_email and private_key");
  }
  return { client_email: value.client_email, private_key: value.private_key };
}

// กันข้อมูลลับหลุดผ่านข้อความ error ที่ agent เขียนลง Sheet (repo นี้เป็น public)
function redact(message: string, sheetId: string): string {
  return message
    .replaceAll(sheetId, "[redacted]")
    .replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, "[redacted-webhook]")
    .replace(/https?:\/\/docs\.google\.com\/spreadsheets\/\S+/gi, "[redacted-sheet-url]")
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[redacted-key]");
}

function buildRows(values: string[][], sheetId: string): LogRow[] {
  const parsed: { row: LogRow; index: number }[] = [];
  let dataRows = 0;

  values.forEach((cells, index) => {
    const sheetRow = index + 1;
    const [timestamp = "", agent = "", status = "", ...rest] = cells.map((c) => c.trim());
    if (cells.every((c) => c.trim() === "")) return; // แถวว่าง
    if (index === 0 && timestamp.toLowerCase() === "timestamp") return; // header
    dataRows++;

    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus !== "SUCCESS" && normalizedStatus !== "FAILURE") {
      console.warn(`::warning::Sheet row ${sheetRow}: status must be SUCCESS or FAILURE — skipped`);
      return;
    }
    if (!TIMESTAMP_PATTERN.test(timestamp)) {
      console.warn(`::warning::Sheet row ${sheetRow}: timestamp is not "YYYY-MM-DD HH:mm:ss" — skipped`);
      return;
    }
    if (agent === "") {
      console.warn(`::warning::Sheet row ${sheetRow}: agent is empty — skipped`);
      return;
    }
    parsed.push({
      index,
      row: {
        timestamp,
        agent,
        status: normalizedStatus,
        message: redact(rest.join(" ").trim(), sheetId),
      },
    });
  });

  if (dataRows > 0 && parsed.length === 0) {
    // ไม่เขียนทับ log.json ด้วยไฟล์ว่างเมื่อรูปแบบข้อมูลใน Sheet เปลี่ยน
    throw new Error("Every data row was rejected; refusing to overwrite log.json");
  }

  // ใหม่สุดก่อน; ถ้าเวลาเท่ากันให้แถวที่อยู่ล่างกว่าใน Sheet มาก่อน
  parsed.sort((a, b) =>
    a.row.timestamp === b.row.timestamp
      ? b.index - a.index
      : a.row.timestamp < b.row.timestamp
        ? 1
        : -1,
  );
  return parsed.slice(0, MAX_ROWS).map((p) => p.row);
}

async function main(): Promise<void> {
  const credentials = parseCredentials(requiredEnv("GOOGLE_SERVICE_ACCOUNT_KEY"));
  const spreadsheetId = requiredEnv("LOG_SHEET_ID").trim();

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A:D", // ไม่ระบุชื่อแท็บ = แท็บแรก
    valueRenderOption: "FORMATTED_VALUE",
  });

  const values = (response.data.values ?? []).map((row) => row.map((v) => String(v ?? "")));
  const rows = buildRows(values, spreadsheetId);

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  // JSON.stringify ไม่แปลงอักษรลาวเป็น \u escape
  await writeFile(OUTPUT_FILE, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log(`Exported ${rows.length} row(s) to office-web/public/data/log.json`);
}

main().catch((error: unknown) => {
  // พิมพ์เฉพาะ message — ห้ามพิมพ์ object ของ error (อาจมี header/token)
  console.error("Log export failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});