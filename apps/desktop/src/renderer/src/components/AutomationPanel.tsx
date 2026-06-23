import { useState } from "react";
import type { ModelTier } from "@workcrew/contracts";
import type { AutomationRunner } from "../hooks/useAutomationRunner";
import { PanelShell } from "./PanelShell";

// The browser and Windows automation surface. The user types a task in plain
// language; WorkCrew plans and runs the steps using the shared runner, asking
// before any change. The runner and its approval modal live in the workspace so
// a scheduled routine and a typed task share one engine.

export function AutomationPanel({ runner, model, onClose, initialTask = "", onSaveRoutine, alwaysAllow = false, onAlwaysAllowChange }: { runner: AutomationRunner; model: ModelTier; onClose: () => void; initialTask?: string; onSaveRoutine?: (task: string) => void; alwaysAllow?: boolean; onAlwaysAllowChange?: (value: boolean) => void }) {
  // Seeded from an example prompt the user clicked on the home screen, if any.
  const [task, setTask] = useState(initialTask);
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [connectError, setConnectError] = useState("");

  const running = runner.running;

  async function connectBrowser() {
    setConnecting(true);
    setConnectNote("");
    setConnectError("");
    try {
      const result = await window.workcrew.automation.launchBrowser();
      setConnectNote(result.message);
    } catch (caught) {
      setConnectError(caught instanceof Error ? caught.message : "Could not start the automation browser.");
    } finally {
      setConnecting(false);
    }
  }

  function start() {
    if (task.trim().length < 3 || running) return;
    void runner.run(task, model, "Task");
  }

  return (
    <PanelShell title="Automation" subtitle="Describe a task and WorkCrew will do it in your browser or apps." onClose={onClose}>
      <div className="save-form">
        <label className="field-label" htmlFor="automation-task">What should WorkCrew do?</label>
        <textarea
          id="automation-task"
          className="automation-task"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="For example: open my email and summarize the unread messages"
          rows={3}
          disabled={running}
        />
        <div className="save-row">
          {running ? (
            <button className="stop-button" onClick={runner.stop}>Stop</button>
          ) : (
            <button className="primary" onClick={start} disabled={task.trim().length < 3}>Run task</button>
          )}
          <button className="link-button" onClick={() => void connectBrowser()} disabled={connecting || running}>
            {connecting ? "Starting browser..." : "Connect browser"}
          </button>
          {onSaveRoutine && !running && task.trim().length >= 3 && (
            <button className="link-button" onClick={() => onSaveRoutine(task.trim())}>Save as a routine</button>
          )}
        </div>
        <p className="field-hint">
          The first time, use Connect browser and sign in to your accounts in the window that opens. WorkCrew asks before
          any change and never enters passwords or payment details for you.
        </p>
        {onAlwaysAllowChange && (
          <label className="always-allow">
            <span className={`switch ${alwaysAllow ? "switch-on" : ""}`} aria-hidden="true">
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(event) => onAlwaysAllowChange(event.target.checked)}
                aria-label="Always allow"
              />
              <span className="switch-knob" />
            </span>
            <span className="always-allow-text">
              <strong>Always allow</strong>
              <small>Run actions without asking each time. <a href="https://getworkcrew.com/safety" target="_blank" rel="noreferrer">See best practices for safe use</a></small>
            </span>
          </label>
        )}
        {connectNote && <p className="notice">{connectNote}</p>}
        {connectError && <p className="error-banner inline">{connectError}</p>}
        {runner.error && <p className="error-banner inline">{runner.error}</p>}
      </div>

      {runner.steps.length > 0 && (
        <ul className="record-list automation-steps">
          {runner.steps.map((step) => (
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

      {runner.summary && (
        <div className={`automation-summary ${runner.status}`} role="status">
          <strong>{runner.status === "complete" ? "Done" : runner.status === "stopped" ? "Stopped" : "Stopped early"}</strong>
          <p>{runner.summary}</p>
          {onSaveRoutine && task.trim().length >= 3 && (
            <button className="primary small save-routine-button" onClick={() => onSaveRoutine(task.trim())}>
              Save as a routine
            </button>
          )}
        </div>
      )}
    </PanelShell>
  );
}
