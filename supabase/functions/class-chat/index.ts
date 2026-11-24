// class-chat: step 5b-3b-2b. Gemini proposal + code-side validation (the last gate).
// AI only proposes; the code decides if the proposal is believable. No database writes ever.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type CalendarDay = { date: string; day_of_week: number; name: string };

// The code (not the LLM) builds the next `days` dates in Laos time (UTC+7).
function laosCalendar(days = 14): CalendarDay[] {
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000 + i * 24 * 60 * 60 * 1000);
    const utcDay = shifted.getUTCDay();
    const dow = utcDay === 0 ? 7 : utcDay; // 1 = Monday ... 7 = Sunday
    out.push({ date: shifted.toISOString().slice(0, 10), day_of_week: dow, name: DAY_NAMES[dow] ?? "" });
  }
  return out;
}

const SYSTEM_PROMPT = `You turn ONE chat message from a student about their class schedule into ONE JSON proposal.
You never change any data. A human confirms your proposal later.
The student writes in Lao, Thai, English or a mix. Understand the meaning, not just keywords.

You receive JSON with: today, calendar (next 14 days, computed by code), schedule (the real weekly classes), user_message.
day_of_week is 1 = Monday ... 7 = Sunday.

Rules:
1. Dates: pick ONLY from calendar. Never calculate a date yourself. "today" is calendar[0], "tomorrow" is calendar[1]. "next Monday" means the first Monday in calendar after the current week's Monday has passed.
2. subject must be copied exactly from a subject in schedule.
3. intent "cancel": needs subject AND date, and that subject must have a class on that date's day_of_week in schedule. If the subject or the date is missing or you are not sure, use "ask_back" instead.
4. intent "move": scope "once" needs subject, date (the original class date) and to_date. scope "permanent" needs subject, from_day_of_week and to_day_of_week. If the student did not say whether it is just this time or forever, use "ask_back" and ask which.
5. intent "ask_back": message is one short question in the student's language.
6. intent "homework" or "note": message is the content, short, in the student's language.
7. intent "question": message is a short answer based ONLY on schedule and calendar.
8. intent "unclear": the message is not about the class schedule.
9. message must NEVER be empty. Always write it in the student's language. Use null for fields you do not need.
10. Never use "cancel" or "move" when a required field is null. In that case use "ask_back" and put your question in message.`;

type Row = { subject: string; location: string | null; day_of_week: number; start_time: string; end_time: string | null };

type GeminiInteraction = {
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: unknown;
};

type GeminiResult =
  | { ok: false; http_status: number; body: string }
  | { ok: true; interaction_status: string | null; proposal: unknown; usage: unknown; ms: number };

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["ask_back", "move", "cancel", "homework", "note", "question", "unclear"] },
    subject: { type: ["string", "null"] },
    scope: { type: "string", enum: ["once", "permanent", "none"] },
    date: { type: ["string", "null"] },
    to_date: { type: ["string", "null"] },
    from_day_of_week: { type: ["integer", "null"] },
    to_day_of_week: { type: ["integer", "null"] },
    message: { type: "string" },
  },
  required: ["intent", "subject", "scope", "date", "to_date", "from_day_of_week", "to_day_of_week", "message"],
};

async function askGemini(userMessage: string, schedule: Row[], calendar: CalendarDay[]): Promise<GeminiResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set in Edge Function secrets");

  const started = Date.now();
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: JSON.stringify({ today: calendar[0], calendar, schedule, user_message: userMessage }),
      system_instruction: SYSTEM_PROMPT,
      store: false, // Google must not keep the student's chat
      generation_config: { thinking_level: "minimal", max_output_tokens: 400 },
      response_format: { type: "text", mime_type: "application/json", schema: PROPOSAL_SCHEMA },
    }),
  });

  const raw = await res.text();
  if (!res.ok) return { ok: false, http_status: res.status, body: raw.slice(0, 800) };

  const data = JSON.parse(raw) as GeminiInteraction;
  const output = (data.steps ?? []).find((s) => s.type === "model_output");
  const text = output?.content?.find((c) => c.type === "text")?.text ?? null;
  if (!text) return { ok: false, http_status: res.status, body: "no model_output text" };

  let proposal: unknown;
  try {
    proposal = JSON.parse(text);
  } catch {
    return { ok: false, http_status: res.status, body: `bad JSON: ${text.slice(0, 400)}` };
  }
  return { ok: true, interaction_status: data.status ?? null, proposal, usage: data.usage ?? null, ms: Date.now() - started };
}

// ---------- Step 2b: validation. The LLM output is NOT trusted until it passes here. ----------
const INTENTS = ["ask_back", "move", "cancel", "homework", "note", "question", "unclear"] as const;
type Intent = (typeof INTENTS)[number];

type Proposal = {
  intent: Intent;
  subject: string | null;
  scope: "once" | "permanent" | "none";
  date: string | null;
  to_date: string | null;
  from_day_of_week: number | null;
  to_day_of_week: number | null;
  message: string;
};

type Verdict = { ok: true; proposal: Proposal } | { ok: false; reason: string };

const isDow = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7;
const fail = (reason: string): Verdict => ({ ok: false, reason });

function checkProposal(value: unknown, schedule: Row[], calendar: CalendarDay[]): Verdict {
  if (typeof value !== "object" || value === null) return fail("proposal is not an object");
  const p = value as Record<string, unknown>;

  const rawIntent = p.intent;
  if (typeof rawIntent !== "string" || !(INTENTS as readonly string[]).includes(rawIntent)) {
    return fail("unknown intent");
  }
  const rawFrom = p.from_day_of_week;
  const rawTo = p.to_day_of_week;

  const proposal: Proposal = {
    intent: rawIntent as Intent,
    subject: typeof p.subject === "string" ? p.subject : null,
    scope: p.scope === "once" || p.scope === "permanent" ? p.scope : "none",
    date: typeof p.date === "string" ? p.date : null,
    to_date: typeof p.to_date === "string" ? p.to_date : null,
    from_day_of_week: isDow(rawFrom) ? rawFrom : null,
    to_day_of_week: isDow(rawTo) ? rawTo : null,
    message: typeof p.message === "string" ? p.message.trim() : "",
  };

  const dayOf = (d: string | null) => calendar.find((c) => c.date === d) ?? null;
  // subject must match a real subject exactly AND have a class on that weekday
  const hasClass = (subject: string | null, dow: number) =>
    subject !== null && schedule.some((r) => r.subject === subject && r.day_of_week === dow);

  if (proposal.intent === "cancel") {
    const day = dayOf(proposal.date);
    if (!day) return fail("cancel: date is not in the calendar");
    if (!hasClass(proposal.subject, day.day_of_week)) return fail("cancel: subject has no class on that day in the real schedule");
    return { ok: true, proposal };
  }

  if (proposal.intent === "move") {
    if (proposal.scope === "once") {
      const from = dayOf(proposal.date);
      const to = dayOf(proposal.to_date);
      if (!from || !to) return fail("move once: date or to_date is not in the calendar");
      if (!hasClass(proposal.subject, from.day_of_week)) return fail("move once: subject has no class on the original date");
      if (from.date === to.date) return fail("move once: to_date equals date");
      return { ok: true, proposal };
    }
    if (proposal.scope === "permanent") {
      const { from_day_of_week: f, to_day_of_week: t } = proposal;
      if (f === null || t === null) return fail("move permanent: from/to day missing");
      if (!hasClass(proposal.subject, f)) return fail("move permanent: subject has no class on from_day_of_week");
      if (f === t) return fail("move permanent: same day");
      return { ok: true, proposal };
    }
    return fail("move: scope must be once or permanent (should have been ask_back)");
  }

  // ask_back, homework, note, question, unclear: the student must get a non-empty message
  if (proposal.message === "") return fail("message is empty");
  return { ok: true, proposal };
}

export default {
  // auth: "user" = the caller must send a valid user JWT (signed in on the web).
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body = await req.json().catch(() => ({}));
    const calendar = laosCalendar();

    // ctx.supabase is scoped to the caller by RLS, so we only see their rows.
    const { data, error } = await ctx.supabase
      .from("class_schedule")
      .select("subject, location, day_of_week, start_time, end_time")
      .order("day_of_week")
      .order("start_time");

    if (error) {
      return Response.json({ ok: false, step: "5b-3b-2b", error: error.message }, { status: 500 });
    }
    const schedule = (data ?? []) as Row[];

    const chat = typeof body?.chat === "string" ? body.chat.trim().slice(0, 500) : "";
    if (chat) {
      try {
        const gemini = await askGemini(chat, schedule, calendar);
        const verdict: Verdict = gemini.ok
          ? checkProposal(gemini.proposal, schedule, calendar)
          : fail(`gemini_error: HTTP ${gemini.http_status}`);
        // verdict.ok === false means: the web must fall back to note-parser.ts (step 5b-4b)
        return Response.json({ step: "5b-3b-2b", today: calendar[0], verdict, gemini });
      } catch (e) {
        // Status 200 on purpose: the browser hides the body of non-2xx responses.
        return Response.json({ ok: false, step: "5b-3b-2b", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return Response.json({ ok: true, step: "5b-3a", auth_mode: ctx.authMode, today: calendar[0], schedule });
  }),
};