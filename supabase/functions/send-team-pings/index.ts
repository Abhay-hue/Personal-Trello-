// Supabase Edge Function: send-team-pings
//
// Run this hourly, same cron as send-deadline-reminders (see README).
// Every run it checks the team_pings table for any ping whose
// send_hour_local matches the current hour in TEAM_TIMEZONE, and hasn't
// already fired today — then pushes + emails everyone on the team.
//
// Edit wording/times any time by updating the team_pings table directly
// (Table Editor) — no redeploy needed.
//
// Manual test: call this function with ?test=true to force-send a test
// ping immediately, ignoring the schedule — use this to confirm push
// notifications are actually reaching your devices.
//
// Deploy:  supabase functions deploy send-team-pings --no-verify-jwt
// Secrets: same as send-deadline-reminders (RESEND_API_KEY, VAPID_*, APP_URL)
//          optionally: supabase secrets set TEAM_TIMEZONE=Asia/Kolkata

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { notifyAllMembers } from "../_shared/notify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEAM_TIMEZONE = Deno.env.get("TEAM_TIMEZONE") || "Asia/Kolkata";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function currentLocalHour(): { hour: number; dateKey: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const hour = parseInt(get("hour"), 10) % 24; // "24" -> 0 on some locales
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  return { hour, dateKey };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "true";

  if (isTest) {
    const result = await notifyAllMembers(
      supabase,
      "🔔 Test ping",
      "This is a manual test from HiAnkita Project Dash — if you got this, push is working."
    );
    return new Response(JSON.stringify({ test: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { hour, dateKey } = currentLocalHour();

  const { data: pings } = await supabase
    .from("team_pings")
    .select("*")
    .eq("enabled", true)
    .eq("send_hour_local", hour);

  const fired: string[] = [];

  for (const ping of pings || []) {
    // Skip if already sent today (idempotent even if cron runs twice in an hour).
    const { data: existing } = await supabase
      .from("team_ping_log")
      .select("ping_key")
      .eq("ping_key", ping.key)
      .eq("sent_on", dateKey)
      .maybeSingle();
    if (existing) continue;

    await notifyAllMembers(supabase, ping.label, ping.message);
    await supabase.from("team_ping_log").insert({ ping_key: ping.key, sent_on: dateKey });
    fired.push(ping.key);
  }

  return new Response(JSON.stringify({ hour, dateKey, fired }), {
    headers: { "Content-Type": "application/json" },
  });
});
