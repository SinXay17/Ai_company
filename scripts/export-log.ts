import { google } from "googleapis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RunStatus = "SUCCESS" | "FAILURE";

interface PublicLogRow {
  timestamp: string;
  agent: string;
  status: RunStatus;
  message: string;
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

const OUTPUT_FILE = path.resolve("office-web/public/data/log.json");
const MAX_ROWS = 200;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const AGENT_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const PUBLIC_MESSAGES: Record<RunStatus, string> = {
  SUCCESS: "ດຳເນີນວຽກສຳເລັດ",
  FAILURE: "ດຳເນີນວຽກບໍ່ສຳເລັດ — ກວດເບິ່ງ Actions log",
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseCredentials(raw: string): ServiceAccountCredentials {
  const value: unknown = JSON.parse(raw);
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

function isRunStatus(value: string): value is RunStatus {
  return value === "SUCCESS" || value === "FAILURE";
}

function parseRows(values: string[][]): PublicLogRow[] {
  const rows: PublicLogRow[] = [];
  let skipped = 0;

  for (const row of values) {
    const timestamp = (row[0] ?? "").trim();
    const agent = (row[1] ?? "").trim();
    const status = (row[2] ?? "").trim().toUpperCase();

    if (timestamp.toLowerCase() === "timestamp") continue;
    if (!TIMESTAMP_PATTERN.test(timestamp) || !AGENT_PATTERN.test(agent) || !isRunStatus(status)) {
      skipped++;
      continue;
    }

    rows.push({
      timestamp,
      agent,
      status,
      message: PUBLIC_MESSAGES[status],
    });
  }

  if (skipped > 0) console.warn(`Skipped ${skipped} invalid row(s) from the log sheet.`);
  return rows.slice(-MAX_ROWS);
}

async function readExistingFile(): Promise<string | undefined> {
  try {
    return await readFile(OUTPUT_FILE, "utf8");
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const credentials = parseCredentials(requiredEnv("GOOGLE_SERVICE_ACCOUNT_KEY"));
  const spreadsheetId = requiredEnv("LOG_SHEET_ID");
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A:D",
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rawValues = response.data.values ?? [];
  const rows = parseRows(
    rawValues.map((row) => row.map((value) => String(value ?? ""))),
  );
  const output = `${JSON.stringify(rows, null, 2)}\n`;

  if ((await readExistingFile()) === output) {
    console.log(`Log export is up to date (${rows.length} row(s)).`);
    return;
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, output, "utf8");
  console.log(`Exported ${rows.length} sanitized row(s) to ${OUTPUT_FILE}.`);
}

main().catch((error: unknown) => {
  console.error("Log export failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
