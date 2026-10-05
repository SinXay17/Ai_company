export type RunStatus = "SUCCESS" | "FAILURE";

/** ໜຶ່ງແຖວໃນ Google Sheet "AI Office Log" */
export interface LogRow {
  timestamp: string; // "2026-10-05 06:00:12" (ເວລາລາວ)
  agent: string; // ກົງກັບ Agent.id
  status: RunStatus;
  message: string;
}

/** ພະນັກງານໜຶ່ງຄົນ — ເພີ່ມລາຍການໃໝ່ໃນ public/data/agents.json */
export interface Agent {
  id: string;
  name: string;
  role: string;
  schedule: string;
  emoji: string;
}