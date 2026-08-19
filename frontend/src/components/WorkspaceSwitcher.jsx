export default function WorkspaceSwitcher({ workspaces, currentId, onChange }) {
  return (
    <div className="workspace-switcher">
      <svg
        className="workspace-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
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
    </div>
  );
}
