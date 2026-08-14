import TaskCard from "./TaskCard";

export default function Column({ title, tasks, membersById, onStatusChange }) {
  return (
    <div className="column">
      <div className="column-header">
        <h2>{title}</h2>
        <span className="column-count">{tasks.length}</span>
      </div>
      <div className="column-body">
        {tasks.length === 0 && <div className="column-empty">Nothing here yet.</div>}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assignee={task.assignee_id ? membersById[task.assignee_id] : null}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  );
}
