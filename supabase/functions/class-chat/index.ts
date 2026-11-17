// class-chat: step 5b-2 skeleton (no AI yet).
// Purpose: prove that (1) the pipe works and (2) only signed-in users get in.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  // auth: "user" = the caller must send a valid user JWT (signed in on the web).
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    return Response.json({
      ok: true,
      step: "5b-2",
      auth_mode: ctx.authMode,
      user_id: ctx.userClaims?.id ?? null,
    });
  }),
};