import { useState } from "react";
import { type Cadence, type Schedule, addSchedule, removeSchedule } from "../lib/storage";
import { PanelShell } from "./PanelShell";

const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly"
};

// A friendly description of the next run for a cadence. This is a label only,
// there is no real scheduling engine in the MVP.
function nextRunText(cadence: Cadence): string {
  const now = new Date();
  if (cadence === "weekly") {
    return "Next: about a week from now";
  }
  if (cadence === "weekdays") {
    const day = now.getDay();
    return day === 5 || day === 6 ? "Next: Monday morning" : "Next: tomorrow morning";
  }
  return "Next: tomorrow morning";
}

export function ScheduledPanel({
  schedules,
  currentTask,
  onClose,
  onChange
}: {
  schedules: Schedule[];
  currentTask: string;
  onClose: () => void;
  onChange: (next: Schedule[]) => void;
}) {
  const [name, setName] = useState("");
  const [task, setTask] = useState(currentTask.trim());
  const [cadence, setCadence] = useState<Cadence>("daily");
  const canAdd = name.trim().length > 0 && task.trim().length >= 3;

  function add() {
    if (!canAdd) return;
    onChange(addSchedule({ name: name.trim(), task: task.trim(), cadence }));
    setName("");
    setTask("");
  }

  return (
    <PanelShell
      title="Scheduled"
      subtitle="Local scheduling for the MVP. Entries are saved on this device and are not run automatically yet."
      onClose={onClose}
    >
      <div className="save-form">
        <label className="field-label" htmlFor="schedule-name">Add a schedule</label>
        <input
          id="schedule-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Schedule name"
        />
        <textarea
          className="schedule-task"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="What should run"
          rows={2}
        />
        <div className="save-row">
          <select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)} aria-label="Cadence">
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
          </select>
          <button className="primary" onClick={add} disabled={!canAdd}>Add schedule</button>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="empty-state">
          <strong>No schedules yet</strong>
          <p>Add a recurring task to keep track of it. Automatic running arrives in a later release.</p>
        </div>
      ) : (
        <ul className="record-list">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="record-row">
              <div className="record-main">
                <p className="record-task"><strong>{schedule.name}</strong></p>
                <p className="record-sub">{schedule.task}</p>
                <div className="record-meta">
                  <span className="tag">{CADENCE_LABEL[schedule.cadence]}</span>
                  <span>{nextRunText(schedule.cadence)}</span>
                </div>
              </div>
              <button
                className="link-button"
                onClick={() => onChange(removeSchedule(schedule.id))}
                aria-label={`Remove schedule ${schedule.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
