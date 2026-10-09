export type RunStatus = "SUCCESS" | "FAILURE";

/** One row of the "AI Office Log" sheet (columns A:D). */
export interface LogRow {
  timestamp: string; // "YYYY-MM-DD HH:mm:ss" (Asia/Vientiane)
  agent: string; // must equal Agent.id
  status: RunStatus;
  message: string;
}

/** One employee. Add an entry in public/data/agents.json to hire. */
export interface Agent {
  id: string; // same name as the Agent column in the Sheet
  name: string;
  role: string;
  schedule: string;
  emoji: string;
}