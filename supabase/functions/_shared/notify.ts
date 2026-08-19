// Shared by: send-deadline-reminders, send-team-pings, ai-command (appreciations)
// Deploy note: this file lives in supabase/functions/_shared/, same folder
// as cors.ts — Supabase bundles it into every function that imports it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const APP_URL = Deno.env.get("APP_URL") || "";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
  vapidConfigured = true;
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "HiAnkita Project Dash <onboarding@resend.dev>", // swap for your verified domain
      to,
      subject,
      html,
    }),
  });
}

export async function sendPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string
) {
  ensureVapid();
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { sent: 0, cleaned: 0 };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  let sent = 0;
  let cleaned = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({ title, body, url: APP_URL })
      );
      sent++;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        cleaned++;
      }
    }
  }
  return { sent, cleaned };
}

// Push + email to every team member (used for team-wide pings).
export async function notifyAllMembers(
  supabase: ReturnType<typeof createClient>,
  title: string,
  body: string
) {
  const { data: members } = await supabase.from("team_members").select("id, email");
  let pushed = 0;
  for (const m of members || []) {
    await sendEmail(m.email, title, `<p>${body}</p>`);
    const { sent } = await sendPushToUser(supabase, m.id, title, body);
    pushed += sent;
  }
  return { members: members?.length || 0, pushed };
}
