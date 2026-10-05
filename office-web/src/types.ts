export type RunStatus = "SUCCESS" | "FAILURE";

/** หนึ่งแถวใน Google Sheet "AI Office Log" */
export interface LogRow {
  timestamp: string; // "2026-10-05 06:00:12" (เวลาลาว)
  agent: string; // ตรงกับ Agent.id
  status: RunStatus;
  message: string;
}

/** พนักงานหนึ่งคน — เพิ่มคนใหม่ = เพิ่ม 1 รายการใน public/data/agents.json */
export interface Agent {
  id: string;
  name: string;
  role: string;
  schedule: string;
  emoji: string;
}