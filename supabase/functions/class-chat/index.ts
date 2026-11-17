// class-chat: step 5b-3a (still no AI).
// Purpose: prove the signed-in user can read THEIR OWN schedule through RLS,
// and that the server computes "today" in Laos time (not the LLM).
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

export default {
  // auth: "user" = the caller must send a valid user JWT (signed in on the web).
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
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