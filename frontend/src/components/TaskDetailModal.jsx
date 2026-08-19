import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const TAG_COLORS = [
  { name: "None", value: null },
  { name: "Orange", value: "#ff8c42" },
  { name: "Lime", value: "#a6e22e" },
  { name: "Pink", value: "#ff3ea5" },
  { name: "Sky", value: "#4b9fff" },
  { name: "Violet", value: "#9c6bff" },
];

export default function TaskDetailModal({ task, members, currentUserId, onClose, onSaved }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [tagColor, setTagColor] = useState(task.tag_color || null);
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 16) : "");
  const [rating, setRating] = useState(task.rating || 0);
  const [revisionCount, setRevisionCount] = useState(task.revision_count || 0);
  const [isSop, setIsSop] = useState(task.is_sop || false);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [links, setLinks] = useState([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("task_assignees")
      .select("member_id")
      .eq("task_id", task.id)
      .then(({ data }) => {
        const ids = data?.map((r) => r.member_id) || [];
        setAssigneeIds(ids.length ? ids : task.assignee_id ? [task.assignee_id] : []);
      });
    supabase
      .from("checklist_items")
      .select("*")
      .eq("task_id", task.id)
      .order("position")
      .then(({ data }) => setChecklist(data || []));
    supabase
      .from("resources")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at")
      .then(({ data }) => setLinks(data || []));
  }, [task.id]);

  function toggleAssignee(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function addChecklistItem() {
    if (!newItemText.trim()) return;
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({ task_id: task.id, text: newItemText, position: checklist.length })
      .select()
      .single();
    if (!error) {
      setChecklist((prev) => [...prev, data]);
      setNewItemText("");
    }
  }

  async function toggleChecklistItem(item) {
    const { error } = await supabase
      .from("checklist_items")
      .update({ is_done: !item.is_done })
      .eq("id", item.id);
    if (!error) {
      setChecklist((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
      );
    }
  }

  async function deleteChecklistItem(item) {
    await supabase.from("checklist_items").delete().eq("id", item.id);
    setChecklist((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function addLink() {
    if (!newLinkUrl.trim()) return;
    const { data, error } = await supabase
      .from("resources")
      .insert({
        task_id: task.id,
        workspace_id: task.workspace_id || null,
        title: newLinkTitle.trim() || newLinkUrl.trim(),
        url: newLinkUrl.trim(),
        added_by: currentUserId || null,
      })
      .select()
      .single();
    if (!error) {
      setLinks((prev) => [...prev, data]);
      setNewLinkTitle("");
      setNewLinkUrl("");
    }
  }

  async function deleteLink(link) {
    await supabase.from("resources").delete().eq("id", link.id);
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await supabase
        .from("tasks")
        .update({
          title,
          description,
          priority,
          tag_color: tagColor,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          rating: rating || null,
          revision_count: revisionCount,
          is_sop: isSop,
          assignee_id: assigneeIds[0] || null, // keep legacy field in sync with first assignee
          reminder_24h_sent: false,
          reminder_12h_sent: false,
          reminder_6h_sent: false,
          reminder_2h_sent: false,
          overdue_notified: false,
        })
        .eq("id", task.id);

      // Sync the multi-assignee join table: clear and re-insert.
      await supabase.from("task_assignees").delete().eq("task_id", task.id);
      if (assigneeIds.length) {
        await supabase
          .from("task_assignees")
          .insert(assigneeIds.map((member_id) => ({ task_id: task.id, member_id })));
      }

      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    await supabase.from("tasks").delete().eq("id", task.id);
    onSaved?.();
    onClose();
  }

  const doneCount = checklist.filter((i) => i.is_done).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <input
          className="modal-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="sop-toggle">
          <input type="checkbox" checked={isSop} onChange={(e) => setIsSop(e.target.checked)} />
          Keep this in the SOP column (always visible, in every workspace)
        </label>

        <textarea
          className="modal-desc-input"
          placeholder="Add a description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="modal-row">
          <div className="modal-field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Due date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-field">
          <label>Color tag</label>
          <div className="tag-swatches">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`tag-swatch ${tagColor === c.value ? "selected" : ""}`}
                style={{ background: c.value || "transparent", borderStyle: c.value ? "solid" : "dashed" }}
                title={c.name}
                onClick={() => setTagColor(c.value)}
              />
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label>Assignees</label>
          <div className="assignee-chips">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`assignee-chip ${assigneeIds.includes(m.id) ? "selected" : ""}`}
                onClick={() => toggleAssignee(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label>
            Checklist {checklist.length > 0 && `(${doneCount}/${checklist.length})`}
          </label>
          <div className="checklist">
            {checklist.map((item) => (
              <div key={item.id} className="checklist-item">
                <input
                  type="checkbox"
                  checked={item.is_done}
                  onChange={() => toggleChecklistItem(item)}
                />
                <span className={item.is_done ? "done" : ""}>{item.text}</span>
                <button className="checklist-delete" onClick={() => deleteChecklistItem(item)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="checklist-add">
            <input
              placeholder="Add a checklist item..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
            />
            <button onClick={addChecklistItem}>Add</button>
          </div>
        </div>

        <div className="modal-field">
          <label>Reference links {links.length > 0 && `(${links.length})`}</label>
          <div className="checklist">
            {links.map((link) => (
              <div key={link.id} className="checklist-item">
                <a href={link.url} target="_blank" rel="noreferrer" className="resource-link">
                  {link.title || link.url}
                </a>
                <button className="checklist-delete" onClick={() => deleteLink(link)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="checklist-add resource-add">
            <input
              placeholder="Label (optional)"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
            />
            <input
              placeholder="Paste a link (PDF, Google Doc, Drive...)"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
            />
            <button onClick={addLink}>Add</button>
          </div>
        </div>

        <div className="modal-row">
          <div className="modal-field">
            <label>Rating</label>
            <div className="star-picker">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`star ${n <= rating ? "filled" : ""}`}
                  onClick={() => setRating(n === rating ? 0 : n)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="modal-field">
            <label>Revisions</label>
            <input
              type="number"
              min="0"
              value={revisionCount}
              onChange={(e) => setRevisionCount(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-delete" onClick={handleDelete}>
            Delete task
          </button>
          <button className="modal-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
