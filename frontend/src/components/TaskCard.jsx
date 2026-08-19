const PRIORITY_COLORS = {
  low: "var(--p-low)",
  medium: "var(--p-medium)",
  high: "var(--p-high)",
  urgent: "var(--p-urgent)",
};

const STATUS_LABELS = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  repository: "Repository",
  done: "Done",
};

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dueBadge(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const hoursLeft = (due - now) / (1000 * 60 * 60);
  let cls = "";
  if (hoursLeft < 0) cls = "overdue";
  else if (hoursLeft < 24) cls = "soon";
  const label = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { cls, label };
}

export default function TaskCard({ task, assignee, onStatusChange, onOpen }) {
  const due = dueBadge(task.due_date);
  const nextStatuses = Object.keys(STATUS_LABELS).filter((s) => s !== task.status);
  const cardStyle = {
    "--priority-color": task.tag_color || PRIORITY_COLORS[task.priority],
  };

  return (
    <div className="task-card" style={cardStyle} onClick={() => onOpen(task)}>
      <div className="task-card-top">
        <div>
          <p className="task-title">
            {task.is_sop && <span className="sop-badge" title="SOP task">SOP</span>}
            {task.title}
          </p>
          {task.description && <p className="task-desc">{task.description}</p>}
        </div>
        <span className="task-id">#{task.id.slice(0, 4).toUpperCase()}</span>
      </div>

      <div className="task-meta">
        {due ? (
          <span className={`task-due ${due.cls}`}>
            {due.cls === "overdue" ? "Overdue " : "Due "}
            {due.label}
          </span>
        ) : (
          <span />
        )}
        {assignee && (
          <span
            className="task-assignee"
            style={{ background: assignee.color }}
            title={assignee.name}
          >
            {initials(assignee.name)}
          </span>
        )}
      </div>

      {task.rating > 0 && (
        <div className="task-rating">{"★".repeat(task.rating)}{"☆".repeat(5 - task.rating)}</div>
      )}

      <div className="status-actions" onClick={(e) => e.stopPropagation()}>
        {nextStatuses.map((s) => (
          <button key={s} onClick={() => onStatusChange(task.id, s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
