// Supabase Edge Function: ai-command  (FREE VERSION — uses Groq)
//
// Takes a plain-English sentence like:
//   "new task: redesign the pricing page, assign to Sara, due Friday"
//   "mark the pricing page task as done"
//   "move the login bug to in progress and make it urgent"
// and turns it into a database write, using Groq's free tier to interpret intent.
//
// Get a free key (no credit card): https://console.groq.com -> API Keys
//
// Deploy:  supabase functions deploy ai-command
// Secrets: supabase secrets set GROQ_API_KEY=gsk_...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail, sendPushToUser } from "../_shared/notify.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = "openai/gpt-oss-120b";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { text, workspace_id } = await req.json();
    if (!text || typeof text !== "string") {
      throw new Error("Expected { text: string }");
    }

    const { data: members } = await supabase
      .from("team_members")
      .select("id, name, email");
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name");
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, assignee_id")
      .neq("status", "done")
      .eq("workspace_id", workspace_id ?? null)
      .order("created_at", { ascending: false })
      .limit(50);

    const systemPrompt = `You are the command interpreter for a small team's project board.
You turn one sentence of plain English into a single JSON action. Reply with ONLY the JSON object, nothing else - no markdown fences, no commentary.

Team members: ${JSON.stringify(members)}
Existing workspaces (clients): ${JSON.stringify(workspaces)}
The person is currently viewing workspace_id: ${workspace_id ?? "null (SOP/no workspace selected)"}
Open tasks in the CURRENT workspace only (id, title, status, priority, due_date, assignee_id): ${JSON.stringify(openTasks)}

Today's date/time (UTC): ${new Date().toISOString()}

Pick ONE action shape based on the sentence:

0. Create a new workspace (use this when the sentence is about creating/starting/adding a new client or workspace, e.g. "create a workspace for Acme Corp", "new client: Acme"):
{"action":"create_workspace","name":"..."}

1. Create a task:
{"action":"create_task","title":"...","description":"","priority":"low|medium|high|urgent","assignee_id":"<uuid or null>","due_date":"<ISO 8601 or null>"}

2. Change a task's status (use this for "done", "mark complete", "move to in progress", "start working on", "move to review", "put in the repository", "back to backlog", etc). Match to the closest existing task by title:
{"action":"update_status","task_id":"<uuid>","status":"backlog|todo|in_progress|review|repository|done"}

3. Reassign a task:
{"action":"assign_task","task_id":"<uuid>","assignee_id":"<uuid or null>"}

4. Change or set a deadline:
{"action":"set_deadline","task_id":"<uuid>","due_date":"<ISO 8601>"}

5. Change priority:
{"action":"set_priority","task_id":"<uuid>","priority":"low|medium|high|urgent"}

6. Delete/cancel a task:
{"action":"delete_task","task_id":"<uuid>"}

7. Add or remove a task from the pinned SOP column (use this for "make this an SOP", "pin this to SOP", "take this out of SOP", etc):
{"action":"set_sop","task_id":"<uuid>","is_sop":true|false}

8. Send an appreciation/shoutout message to a teammate (use this for "tell Sara great job", "give Rajat a shoutout for the design", "thank Priya for the writeup", etc). Resolve the person by name against the team list:
{"action":"send_appreciation","to_member_id":"<uuid>","message":"<short, warm, specific to what they did>"}

9. If the sentence is ambiguous, refers to a task you cannot confidently match, or isn't board-related:
{"action":"unknown","reason":"<short explanation to show the user>"}

Rules:
- Resolve relative dates ("Friday", "next week", "tomorrow") against today's date above, output absolute ISO 8601 timestamps (assume 5pm local business close if no time given, but just use UTC).
- Only match an existing task if you're reasonably confident which one is meant. Otherwise use "unknown".
- Resolve people by first name, nickname, or email against the team list. If no clear match, leave assignee_id null.`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq API error: ${errText}`);
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      throw new Error(`Could not parse AI response: ${rawText}`);
    }

    let resultMessage = "";
    let task = null;

    switch (parsed.action) {
      case "create_workspace": {
        const { data, error } = await supabase
          .from("workspaces")
          .insert({ name: parsed.name, created_by: user.id })
          .select()
          .single();
        if (error) throw error;
        resultMessage = `Created workspace "${data.name}". Switch to it from the workspace menu.`;
        return new Response(
          JSON.stringify({ message: resultMessage, workspace: data, action: parsed.action }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      case "create_task": {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            title: parsed.title,
            description: parsed.description || "",
            priority: parsed.priority || "medium",
            assignee_id: parsed.assignee_id || null,
            due_date: parsed.due_date || null,
            created_by: user.id,
            workspace_id: workspace_id ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = `Created "${data.title}".`;
        break;
      }
      case "update_status": {
        const { data, error } = await supabase
          .from("tasks")
          .update({ status: parsed.status })
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = `Moved "${data.title}" to ${parsed.status.replace("_", " ")}.`;
        break;
      }
      case "assign_task": {
        const { data, error } = await supabase
          .from("tasks")
          .update({ assignee_id: parsed.assignee_id })
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = `Updated assignee on "${data.title}".`;
        break;
      }
      case "set_deadline": {
        const { data, error } = await supabase
          .from("tasks")
          .update({
            due_date: parsed.due_date,
            reminder_24h_sent: false,
            reminder_12h_sent: false,
            reminder_6h_sent: false,
            reminder_2h_sent: false,
            overdue_notified: false,
          })
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = `Set the deadline on "${data.title}".`;
        break;
      }
      case "set_priority": {
        const { data, error } = await supabase
          .from("tasks")
          .update({ priority: parsed.priority })
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = `Set "${data.title}" to ${parsed.priority} priority.`;
        break;
      }
      case "set_sop": {
        const { data, error } = await supabase
          .from("tasks")
          .update({ is_sop: parsed.is_sop })
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        task = data;
        resultMessage = parsed.is_sop
          ? `Pinned "${data.title}" to the SOP column.`
          : `Removed "${data.title}" from the SOP column.`;
        break;
      }
      case "send_appreciation": {
        const { data: toMember } = await supabase
          .from("team_members")
          .select("id, name, email")
          .eq("id", parsed.to_member_id)
          .single();
        if (!toMember) throw new Error("Couldn't find that teammate.");

        await supabase.from("appreciations").insert({
          from_member: user.id,
          to_member: toMember.id,
          message: parsed.message,
        });
        await sendEmail(toMember.email, "You got a shoutout! 🎉", `<p>${parsed.message}</p>`);
        await sendPushToUser(supabase, toMember.id, "You got a shoutout! 🎉", parsed.message);

        resultMessage = `Sent ${toMember.name} a shoutout.`;
        break;
      }
      case "delete_task": {
        const { data, error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", parsed.task_id)
          .select()
          .single();
        if (error) throw error;
        resultMessage = `Deleted "${data?.title ?? "task"}".`;
        break;
      }
      default: {
        resultMessage = parsed.reason || "I couldn't tell what you wanted to do — try rephrasing.";
      }
    }

    await supabase.from("ai_command_log").insert({
      user_id: user.id,
      input_text: text,
      parsed_action: parsed,
      result: resultMessage,
    });

    return new Response(JSON.stringify({ message: resultMessage, task, action: parsed.action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
