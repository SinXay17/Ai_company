// class-chat: step 5b-3b-1 (Gemini smoke test) on top of 5b-3a.
// Purpose: prove GEMINI_API_KEY works and the Interactions API request shape is right.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Same approach as class-agent.ts: shift UTC by +7h, then read the date parts.
// day_of_week: 1 = Monday ... 7 = Sunday (matches class_schedule.day_of_week)
function laosToday(): { date: string; day_of_week: number } {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const day = shifted.getUTCDay();
  return {
    date: shifted.toISOString().slice(0, 10), // "YYYY-MM-DD" in Laos time
    day_of_week: day === 0 ? 7 : day,
  };
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.5-flash-lite";

type GeminiInteraction = {
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: unknown;
};

// Smoke test: tiny prompt, JSON output, store=false (Google must not keep the chat).
async function geminiSmokeTest() {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set in Edge Function secrets");

  const started = Date.now();
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: "Say hello in one short sentence.",
      system_instruction: "You are a test. Reply only with the requested JSON.",
      store: false,
      generation_config: { thinking_level: "minimal", max_output_tokens: 200 },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: { reply: { type: "string" } },
          required: ["reply"],
        },
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    // Show Google's own error text so we can read it on the web page.
    return { ok: false, http_status: res.status, body: raw.slice(0, 800) };
  }

  const data = JSON.parse(raw) as GeminiInteraction;
  const steps = data.steps ?? [];
  const output = steps.find((s) => s.type === "model_output");
  const text = output?.content?.find((c) => c.type === "text")?.text ?? null;

  return {
    ok: true,
    http_status: res.status,
    interaction_status: data.status ?? null,
    step_types: steps.map((s) => s.type),
    text,
    usage: data.usage ?? null,
    ms: Date.now() - started,
  };
}

export default {
  // auth: "user" = the caller must send a valid user JWT (signed in on the web).
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body = await req.json().catch(() => ({}));

    if (body?.probe === "gemini") {
      try {
        return Response.json({ ok: true, step: "5b-3b-1", gemini: await geminiSmokeTest() });
      } catch (e) {
        // Status 200 on purpose: the browser hides the body of non-2xx responses.
        return Response.json({
          ok: false,
          step: "5b-3b-1",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ctx.supabase is scoped to the caller by RLS, so we only see their rows.
    const { data, error } = await ctx.supabase
      .from("class_schedule")
      .select("subject, location, day_of_week, start_time, end_time")
      .order("day_of_week")
      .order("start_time");

    if (error) {
      return Response.json({ ok: false, step: "5b-3a", error: error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      step: "5b-3a",
      auth_mode: ctx.authMode,
      today: laosToday(),
      schedule: data,
    });
  }),
};