import { useState } from "react";
import { type Workflow, addWorkflow, formatAbsoluteTime, removeWorkflow } from "../lib/storage";
import { PanelShell } from "./PanelShell";

export function WorkflowsPanel({
  workflows,
  currentTask,
  onClose,
  onChange,
  onRun
}: {
  workflows: Workflow[];
  currentTask: string;
  onClose: () => void;
  onChange: (next: Workflow[]) => void;
  onRun: (task: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmedTask = currentTask.trim();
  const canSave = name.trim().length > 0 && trimmedTask.length >= 3;

  function save() {
    if (!canSave) return;
    onChange(addWorkflow(name, trimmedTask));
    setName("");
  }

  return (
    <PanelShell title="Workflows" subtitle="Save a task once, run it whenever you need it." onClose={onClose}>
      <div className="save-form">
        <label className="field-label" htmlFor="workflow-name">Save the current task</label>
        <div className="save-row">
          <input
            id="workflow-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this workflow"
            onKeyDown={(event) => { if (event.key === "Enter") save(); }}
          />
          <button className="primary" onClick={save} disabled={!canSave}>Save</button>
        </div>
        {trimmedTask.length < 3 ? (
          <p className="field-hint">Type a task in the composer first, then save it here.</p>
        ) : (
          <p className="field-hint">Will save: {trimmedTask}</p>
        )}
      </div>

      {workflows.length === 0 ? (
        <div className="empty-state">
          <strong>No saved workflows</strong>
          <p>Saved tasks show up here so you can run them in one click.</p>
        </div>
      ) : (
        <ul className="record-list">
          {workflows.map((workflow) => (
            <li key={workflow.id} className="record-row">
              <div className="record-main">
                <p className="record-task"><strong>{workflow.name}</strong></p>
                <p className="record-sub">{workflow.task}</p>
                <div className="record-meta"><span>Saved {formatAbsoluteTime(workflow.createdAt)}</span></div>
              </div>
              <div className="record-actions">
                <button className="primary small" onClick={() => onRun(workflow.task)}>Run</button>
                <button
                  className="link-button"
                  onClick={() => onChange(removeWorkflow(workflow.id))}
                  aria-label={`Remove workflow ${workflow.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
