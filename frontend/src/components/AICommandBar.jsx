import { useState } from "react";
import { supabase } from "../supabaseClient";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-command`;

export default function AICommandBar({ workspaceId, onHandled }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null); // { ok: bool, message: string }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setFeedback(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ text, workspace_id: workspaceId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      setFeedback({ ok: true, message: data.message });
      setText("");
      onHandled?.();
    } catch (err) {
      setFeedback({ ok: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="command-bar">
      <form className="command-form" onSubmit={handleSubmit}>
        <input
          className="command-input"
          placeholder='Try: "new task: redesign the pricing page, assign to Sara, due Friday" or "create a workspace for Acme Corp"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <button className="command-submit" type="submit" disabled={loading}>
          {loading ? "Working..." : "Tell it"}
        </button>
      </form>
      <p className="command-hint">
        You can also say "mark the pricing page task as done," "make the login bug urgent," or
        "create a workspace for [client name]."
      </p>
      {feedback && (
        <div className={`command-feedback ${feedback.ok ? "ok" : "err"}`}>{feedback.message}</div>
      )}
    </div>
  );
}
