import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// One single team-wide chat channel — not scoped per client/workspace.
// This is intentionally internal-only: the 4 teammates (Abhay, Ankita,
// Rajat, Varsha), never clients. All messages are stored with
// workspace_id = null, which is what marks them as "general" rather
// than belonging to a specific client's workspace.
export default function TeamChat({ membersById, currentUserId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("workspace_messages")
      .select("*")
      .is("workspace_id", null)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled) {
          setMessages(data || []);
          setLoading(false);
        }
      });

    // No server-side filter on workspace_id here — Realtime's filter
    // syntax doesn't reliably support "is null", so we subscribe to all
    // inserts and filter client-side instead. Fine at this team's
    // volume (4 people, one channel).
    const channel = supabase
      .channel("team-chat-general")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "workspace_messages" },
        (payload) => {
          if (payload.new.workspace_id === null) {
            setMessages((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await supabase.from("workspace_messages").insert({
      workspace_id: null,
      member_id: currentUserId,
      text: trimmed,
    });
  }

  return (
    <aside className="chat-panel">
      <div className="chat-panel-header">
        <span>Team chat</span>
        <button className="chat-close-btn" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {loading && <div className="chat-empty-state">Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty-state">No messages yet — say something.</div>
        )}
        {messages.map((m) => {
          const sender = membersById[m.member_id];
          const mine = m.member_id === currentUserId;
          return (
            <div key={m.id} className={`chat-message${mine ? " chat-message-mine" : ""}`}>
              {!mine && (
                <span
                  className="avatar avatar-sm"
                  style={{ background: sender?.color || "#4b6bfb" }}
                  title={sender?.name || "Unknown"}
                >
                  {initials(sender?.name)}
                </span>
              )}
              <div className="chat-bubble">
                {!mine && <div className="chat-bubble-sender">{sender?.name || "Unknown"}</div>}
                <div className="chat-bubble-text">{m.text}</div>
                <div className="chat-bubble-time">{formatTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the team…"
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
