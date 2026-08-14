// Supabase Edge Function: send-deadline-reminders
//
// Run this on a schedule (Supabase Dashboard -> Edge Functions -> Cron,
// or pg_cron - see README). Every run it:
//   1. Emails + push-notifies anyone whose task is due within 24h
//      (once per task).
//   2. Emails + push-notifies anyone whose task is overdue
//      (once per task).
//
// Deploy:  supabase functions deploy send-deadline-reminders --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_...
//          supabase secrets set VAPID_PUBLIC_KEY=...
//          supabase secrets set VAPID_PRIVATE_KEY=...
//          supabase secrets set VAPID_SUBJECT=mailto:you@example.com
//          supabase secrets set APP_URL=https://yourname.github.io/pm-tool

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const APP_URL = Deno.env.get("APP_URL") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Boardroom <onboarding@resend.dev>", // swap for your verified domain
      to,
      subject,
      html,
    }),
  });
}

async function sendPush(userId: string, title: string, body: string) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({ title, body, url: APP_URL })
      );
    } catch (err) {
      // Subscription likely expired - clean it up.
      if ((err as { statusCode?: number }).statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
}

Deno.serve(async () => {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // --- Upcoming deadlines (due within 24h, not yet reminded) ---
  const { data: upcoming } = await supabase
    .from("tasks")
    .select("*, team_members!tasks_assignee_id_fkey(id, name, email)")
    .neq("status", "done")
    .eq("reminder_sent", false)
    .not("due_date", "is", null)
    .lte("due_date", in24h.toISOString())
    .gte("due_date", now.toISOString());

  for (const task of upcoming || []) {
    const assignee = task.team_members;
    if (!assignee) continue;
    const when = new Date(task.due_date).toLocaleString();
    await sendEmail(
      assignee.email,
      `Due soon: ${task.title}`,
      `<p><strong>${task.title}</strong> is due ${when}.</p><p>${task.description || ""}</p>`
    );
    await sendPush(assignee.id, "Deadline coming up", `${task.title} is due ${when}`);
    await supabase.from("tasks").update({ reminder_sent: true }).eq("id", task.id);
  }

  // --- Overdue (past due, not yet notified as overdue) ---
  const { data: overdue } = await supabase
    .from("tasks")
    .select("*, team_members!tasks_assignee_id_fkey(id, name, email)")
    .neq("status", "done")
    .eq("overdue_notified", false)
    .not("due_date", "is", null)
    .lt("due_date", now.toISOString());

  for (const task of overdue || []) {
    const assignee = task.team_members;
    if (!assignee) continue;
    await sendEmail(
      assignee.email,
      `Overdue: ${task.title}`,
      `<p><strong>${task.title}</strong> was due ${new Date(task.due_date).toLocaleString()} and is still open.</p>`
    );
    await sendPush(assignee.id, "Task overdue", `${task.title} is overdue`);
    await supabase.from("tasks").update({ overdue_notified: true }).eq("id", task.id);
  }

  return new Response(
    JSON.stringify({ upcoming: upcoming?.length || 0, overdue: overdue?.length || 0 }),
    { headers: { "Content-Type": "application/json" } }
  );
});
