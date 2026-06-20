import { type HistoryEntry, clearHistory, formatAbsoluteTime } from "../lib/storage";
import { PanelShell } from "./PanelShell";

const OUTCOME_LABEL: Record<HistoryEntry["outcome"], string> = {
  complete: "Completed",
  stopped: "Stopped",
  failed: "Failed"
};

export function HistoryPanel({
  entries,
  onClose,
  onReuse,
  onCleared
}: {
  entries: HistoryEntry[];
  onClose: () => void;
  onReuse: (task: string) => void;
  onCleared: () => void;
}) {
  return (
    <PanelShell title="History" subtitle="Every run is saved on this device, newest first." onClose={onClose}>
      {entries.length === 0 ? (
        <div className="empty-state">
          <strong>No runs yet</strong>
          <p>When you run a task, it will appear here so you can reuse it later.</p>
        </div>
      ) : (
        <>
          <div className="panel-toolbar">
            <span>{entries.length} {entries.length === 1 ? "run" : "runs"}</span>
            <button className="link-button" onClick={onCleared}>Clear history</button>
          </div>
          <ul className="record-list">
            {entries.map((entry) => (
              <li key={entry.id} className="record-row">
                <div className="record-main">
                  <p className="record-task">{entry.task}</p>
                  <div className="record-meta">
                    <span className={`tag tag-${entry.outcome}`}>{OUTCOME_LABEL[entry.outcome]}</span>
                    <span>{formatAbsoluteTime(entry.timestamp)}</span>
                    <span>{entry.activityCount} {entry.activityCount === 1 ? "step" : "steps"}</span>
                  </div>
                </div>
                <button className="secondary small" onClick={() => onReuse(entry.task)}>Reuse</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelShell>
  );
}
