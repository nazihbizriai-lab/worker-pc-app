import { useEffect, useRef } from "react";
import type { AutomationRunner } from "../hooks/useAutomationRunner";

// Shows an automation run inline inside the chat: the task being done, each step
// as it happens, and the final result. This replaces the old separate Automation
// panel, so the user just talks in one chat and watches the work unfold in place.
export function AutomationActivity({
  runner,
  task,
  onSaveRoutine
}: {
  runner: AutomationRunner;
  task: string;
  onSaveRoutine?: () => void;
}) {
  const { steps, summary, status, error, running } = runner;
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest step in view as the run progresses.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [steps.length, summary, running]);

  // Nothing to show until a run has started or has left a result behind.
  if (!running && steps.length === 0 && !summary && !error) return null;

  const headline = running
    ? "Working on it"
    : status === "complete"
      ? "Done"
      : status === "stopped"
        ? "Stopped"
        : "Stopped early";

  return (
    <section className={`run-activity run-${status}`} aria-live="polite">
      <div className="run-head">
        <span className={`run-indicator ${running ? "run-indicator-busy" : ""}`} aria-hidden="true" />
        <div className="run-head-text">
          <strong>{headline}</strong>
          {task && <p className="run-task">{task}</p>}
        </div>
        {running && (
          <button type="button" className="stop-button" onClick={runner.stop}>Stop</button>
        )}
      </div>

      {steps.length > 0 && (
        <ul className="record-list run-steps">
          {steps.map((step) => (
            <li key={step.id} className={`automation-step step-${step.status}`}>
              <span className="step-dot" aria-hidden="true" />
              <div className="record-main">
                <p className="record-task"><strong>{step.label}</strong></p>
                {step.detail && <p className="record-sub">{step.detail}</p>}
              </div>
              <span className="step-status">{step.status}</span>
            </li>
          ))}
        </ul>
      )}

      {summary && <p className="run-summary">{summary}</p>}
      {error && <p className="error-banner inline">{error}</p>}

      {onSaveRoutine && status === "complete" && (
        <button type="button" className="link-button run-save" onClick={onSaveRoutine}>
          Save as a routine
        </button>
      )}
      <div ref={endRef} />
    </section>
  );
}
