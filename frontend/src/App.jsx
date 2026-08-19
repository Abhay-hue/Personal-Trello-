import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { enablePush, getPushPermissionState } from "./push";
import Login from "./components/Login";
import Board from "./components/Board";
import AICommandBar from "./components/AICommandBar";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [pushState, setPushState] = useState("default");

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Make sure this person has a team_members row (name defaults to email prefix).
  useEffect(() => {
    if (!session) return;
    supabase
      .from("team_members")
      .upsert(
        {
          id: session.user.id,
          name: session.user.email.split("@")[0],
          email: session.user.email,
        },
        { onConflict: "id", ignoreDuplicates: true }
      )
      .then(() => {});
    getPushPermissionState().then(setPushState);
  }, [session]);

  const loadData = useCallback(async () => {
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("team_members").select("*"),
    ]);
    setTasks(t || []);
    setMembers(m || []);
  }, []);

  // --- Data + realtime sync ---
  useEffect(() => {
    if (!session) return;
    loadData();

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, loadData)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session, loadData]);

  async function handleStatusChange(taskId, status) {
    await supabase.from("tasks").update({ status }).eq("id", taskId);
  }

  async function handleEnablePush() {
    try {
      await enablePush(session.user.id);
      setPushState("granted");
    } catch (err) {
      alert(err.message);
    }
  }

  if (session === undefined) return null; // brief loading flash
  if (!session) return <Login />;

  const me = members.find((m) => m.id === session.user.id);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>HiAnkita Project Dash</h1>
          <div className="tagline">Tell it what happened. It'll handle the board.</div>
        </div>
        <div className="header-right">
          {pushState !== "granted" && pushState !== "unsupported" && (
            <button className="pill-btn" onClick={handleEnablePush}>
              Enable push alerts
            </button>
          )}
          <button className="pill-btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
          {me && (
            <span className="avatar" style={{ background: me.color }} title={me.name}>
              {initials(me.name)}
            </span>
          )}
        </div>
      </header>

      <AICommandBar onHandled={loadData} />
      <Board tasks={tasks} members={members} onStatusChange={handleStatusChange} />
    </div>
  );
}
