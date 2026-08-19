export default function WorkspaceSwitcher({ workspaces, currentId, onChange }) {
  return (
    <select
      className="workspace-select"
      value={currentId ?? "sop"}
      onChange={(e) => onChange(e.target.value === "sop" ? null : e.target.value)}
    >
      <option value="sop">SOP / No workspace</option>
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
