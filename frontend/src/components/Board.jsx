import Column from "./Column";

const COLUMNS = [
  { key: "todo", title: "To do" },
  { key: "in_progress", title: "In progress" },
  { key: "done", title: "Done" },
];

export default function Board({ tasks, members, onStatusChange }) {
  const membersById = Object.fromEntries(members.map((m) => [m.id, m]));

  return (
    <div className="board">
      {COLUMNS.map((col) => (
        <Column
          key={col.key}
          title={col.title}
          tasks={tasks.filter((t) => t.status === col.key)}
          membersById={membersById}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}
