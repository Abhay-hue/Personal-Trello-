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

// --- WhatsApp via CallMeBot (free, personal-use only) ---
// Only fires for team members who have both callmebot_phone and
// callmebot_apikey set on their team_members row. Anyone else is
// silently skipped — this is intentional, not an error.
// Never throws: a failed/misconfigured WhatsApp send should never take
// down the email/push notifications running alongside it.
export async function sendWhatsApp(phone: string | null, apikey: string | null, text: string) {
  if (!phone || !apikey) return { sent: false, reason: "not configured" };
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
      phone
    )}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url);
    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`CallMeBot send failed for ${phone}: ${res.status} ${bodyText}`);
      return { sent: false, reason: `http ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error(`CallMeBot send threw for ${phone}:`, err);
    return { sent: false, reason: (err as Error).message };
  }
}

// One member, all three channels: email + push + WhatsApp (if configured).
// This is the one function everything else should call — it's the single
// choke point for "notify this person," so every new channel we add later
// (e.g. Phase 3 chat mentions) only needs to be wired in here once.
export async function notifyMember(
  supabase: ReturnType<typeof createClient>,
  member: { id: string; email: string; callmebot_phone?: string | null; callmebot_apikey?: string | null },
  title: string,
  body: string
) {
  await sendEmail(member.email, title, `<p>${body}</p>`);
  const push = await sendPushToUser(supabase, member.id, title, body);
  const whatsapp = await sendWhatsApp(
    member.callmebot_phone ?? null,
    member.callmebot_apikey ?? null,
    `*${title}*\n${body}`
  );
  return { push, whatsapp };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Push + email + WhatsApp to every team member (used for team-wide pings).
// Sends are staggered ~1.5s apart — CallMeBot is a single free personal
// bot, not built for simultaneous bulk sends, so this avoids silent drops
// when all 4 CallMeBot-enabled people get pinged in the same run.
export async function notifyAllMembers(
  supabase: ReturnType<typeof createClient>,
  title: string,
  body: string
) {
  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, callmebot_phone, callmebot_apikey");

  let pushed = 0;
  let whatsapped = 0;
  for (const m of members || []) {
    const { push, whatsapp } = await notifyMember(supabase, m, title, body);
    pushed += push.sent;
    if (whatsapp.sent) whatsapped++;
    await sleep(1500);
  }
  return { members: members?.length || 0, pushed, whatsapped };
}
