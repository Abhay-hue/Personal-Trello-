import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { enablePush, getPushPermissionState } from "./push";
import Login from "./components/Login";
import Board from "./components/Board";
import AICommandBar from "./components/AICommandBar";
import WorkspaceSwitcher from "./components/WorkspaceSwitcher";
import TaskDetailModal from "./components/TaskDetailModal";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null); // null = SOP view
  const [pushState, setPushState] = useState("default");
  const [openTask, setOpenTask] = useState(null);

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

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
    const [{ data: t }, { data: m }, { data: w }] = await Promise.all([
      supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("team_members").select("*"),
      supabase.from("workspaces").select("*").order("name"),
    ]);
    setTasks(t || []);
    setMembers(m || []);
    setWorkspaces(w || []);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadData();

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, loadData)
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

  if (session === undefined) return null;
  if (!session) return <Login />;

  const me = members.find((m) => m.id === session.user.id);

  const visibleTasks = tasks
    .filter((t) => t.is_sop || t.workspace_id === currentWorkspaceId)
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>HiAnkita Project Dash</h1>
          <div className="tagline">Tell it what happened. It'll handle the board.</div>
        </div>
        <div className="header-right">
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentId={currentWorkspaceId}
            onChange={setCurrentWorkspaceId}
          />
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

      <AICommandBar workspaceId={currentWorkspaceId} onHandled={loadData} />
      <Board
        tasks={visibleTasks}
        members={members}
        onStatusChange={handleStatusChange}
        onOpen={setOpenTask}
      />

      {openTask && (
        <TaskDetailModal
          task={openTask}
          members={members}
          onClose={() => setOpenTask(null)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
