// Supabase Edge Function: send-deadline-reminders
//
// Run this on a schedule (hourly, via pg_cron — see README). Every run it
// checks each open task with a due date against 5 thresholds, and fires
// each one exactly once as time crosses it:
//   24h before -> 12h before -> 6h before -> 2h before -> overdue
//
// Threshold checks are monotonic ("has now passed this point AND haven't
// sent it yet"), so this is safe even if the cron run is a few minutes
// late or occasionally double-fires — nothing sends twice.
//
// Deploy:  supabase functions deploy send-deadline-reminders --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_...
//          supabase secrets set VAPID_PUBLIC_KEY=...
//          supabase secrets set VAPID_PRIVATE_KEY=...
//          supabase secrets set VAPID_SUBJECT=mailto:you@example.com
//          supabase secrets set APP_URL=https://yourname.github.io/pm-tool
// (WhatsApp needs no separate secret — CallMeBot keys live per-person on
// the team_members row, see supabase/migrations/0003_callmebot.sql)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { notifyMember } from "../_shared/notify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Ordered soonest-column-fires-first is irrelevant here — each tier is
// independent — but listed largest-window to smallest for readability.
const TIERS = [
  { hours: 24, column: "reminder_24h_sent", label: "due in 24 hours" },
  { hours: 12, column: "reminder_12h_sent", label: "due in 12 hours" },
  { hours: 6, column: "reminder_6h_sent", label: "due in 6 hours" },
  { hours: 2, column: "reminder_2h_sent", label: "due in 2 hours" },
];

const ASSIGNEE_SELECT =
  "*, team_members!tasks_assignee_id_fkey(id, name, email, callmebot_phone, callmebot_apikey)";

Deno.serve(async () => {
  const now = new Date();
  let tierNotifications = 0;

  for (const tier of TIERS) {
    const threshold = new Date(now.getTime() + tier.hours * 60 * 60 * 1000);

    const { data: due } = await supabase
      .from("tasks")
      .select(ASSIGNEE_SELECT)
      .neq("status", "done")
      .eq(tier.column, false)
      .not("due_date", "is", null)
      .gte("due_date", now.toISOString())
      .lte("due_date", threshold.toISOString());

    for (const task of due || []) {
      const assignee = task.team_members;
      const when = new Date(task.due_date).toLocaleString();

      if (assignee) {
        await notifyMember(
          supabase,
          assignee,
          `Due soon: ${task.title}`,
          `${task.title} is ${tier.label} (${when}).`
        );
      }

      await supabase.from("tasks").update({ [tier.column]: true }).eq("id", task.id);
      tierNotifications++;
    }
  }

  // --- Overdue (past due, not yet notified as overdue) ---
  const { data: overdue } = await supabase
    .from("tasks")
    .select(ASSIGNEE_SELECT)
    .neq("status", "done")
    .eq("overdue_notified", false)
    .not("due_date", "is", null)
    .lt("due_date", now.toISOString());

  for (const task of overdue || []) {
    const assignee = task.team_members;
    if (assignee) {
      await notifyMember(
        supabase,
        assignee,
        `Overdue: ${task.title}`,
        `${task.title} was due ${new Date(task.due_date).toLocaleString()} and is still open.`
      );
    }
    await supabase.from("tasks").update({ overdue_notified: true }).eq("id", task.id);
  }

  return new Response(
    JSON.stringify({ tierNotifications, overdue: overdue?.length || 0 }),
    { headers: { "Content-Type": "application/json" } }
  );
});
