import { useRef, useState } from "react";
import type { AutomationAction, ModelTier } from "@workcrew/contracts";
import { actionDetail, actionLabel } from "../lib/automation";
import { actionNeedsApproval, redactResult } from "../security";
import { addHistory } from "../lib/storage";
import { ApprovalModal } from "./ApprovalModal";
import { PanelShell } from "./PanelShell";

// The browser and Windows automation surface. The user types a task in plain
// language; WorkCrew plans and runs the steps, asking before any change. The
// client caps the loop at the same ceiling the server enforces.

const MAX_STEPS = 24;

type StepStatus = "running" | "ok" | "error" | "declined";
type Step = { id: string; label: string; detail?: string; status: StepStatus };
type RunStatus = "idle" | "running" | "complete" | "failed" | "stopped";

function stepId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AutomationPanel({ model, onClose }: { model: ModelTier; onClose: () => void }) {
  const [task, setTask] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [pending, setPending] = useState<{ action: AutomationAction; label: string } | null>(null);

  const stoppedRef = useRef(false);
  const approvalResolve = useRef<((approved: boolean) => void) | null>(null);

  function requestApproval(action: AutomationAction): Promise<boolean> {
    return new Promise((resolve) => {
      approvalResolve.current = resolve;
      setPending({ action, label: actionLabel(action) });
    });
  }

  function decide(approved: boolean) {
    setPending(null);
    const resolve = approvalResolve.current;
    approvalResolve.current = null;
    resolve?.(approved);
  }

  function pushStep(step: Step) {
    setSteps((current) => [...current, step]);
  }

  function settleStep(id: string, statusValue: StepStatus) {
    setSteps((current) => current.map((item) => (item.id === id ? { ...item, status: statusValue } : item)));
  }

  async function connectBrowser() {
    setConnecting(true);
    setConnectNote("");
    setError("");
    try {
      const result = await window.workcrew.automation.launchBrowser();
      setConnectNote(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the automation browser.");
    } finally {
      setConnecting(false);
    }
  }

  async function run() {
    const trimmed = task.trim();
    if (trimmed.length < 3 || status === "running") return;
    stoppedRef.current = false;
    setSteps([]);
    setSummary("");
    setError("");
    setStatus("running");

    try {
      const { runId } = await window.workcrew.api.createRun(trimmed, model);
      let result: { toolUseId: string; ok: boolean; output: string } | undefined;

      for (let step = 0; step < MAX_STEPS; step += 1) {
        if (stoppedRef.current) {
          setStatus("stopped");
          break;
        }
        const response = await window.workcrew.api.nextRun(runId, result);

        if (response.status === "complete") {
          setSummary(response.message ?? "Task complete.");
          setStatus("complete");
          break;
        }
        if (response.status === "failed") {
          setSummary(response.message ?? "This task stopped.");
          setStatus("failed");
          break;
        }
        if (!response.action || !response.toolUseId) break;

        const action = response.action;
        const id = stepId();
        pushStep({ id, label: actionLabel(action), detail: actionDetail(action), status: "running" });

        if (actionNeedsApproval(action)) {
          const approved = await requestApproval(action);
          if (!approved) {
            settleStep(id, "declined");
            result = { toolUseId: response.toolUseId, ok: false, output: "You declined this action." };
            continue;
          }
        }

        try {
          const output = await window.workcrew.automation.execute(action);
          settleStep(id, "ok");
          result = { toolUseId: response.toolUseId, ok: true, output: redactResult(output) };
        } catch (caught) {
          settleStep(id, "error");
          const message = caught instanceof Error ? caught.message : "That step could not be completed.";
          result = { toolUseId: response.toolUseId, ok: false, output: redactResult(message) };
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The task could not be started.");
      setStatus("failed");
    } finally {
      // Record the outcome for the local history list.
      setStatus((current) => {
        addHistory({
          task: trimmed,
          timestamp: Date.now(),
          outcome: current === "complete" ? "complete" : current === "stopped" ? "stopped" : "failed",
          activityCount: 0
        });
        return current;
      });
    }
  }

  function stop() {
    stoppedRef.current = true;
    void window.workcrew.automation.stop();
    setStatus("stopped");
  }

  const running = status === "running";

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
            <button className="stop-button" onClick={stop}>Stop</button>
          ) : (
            <button className="primary" onClick={() => void run()} disabled={task.trim().length < 3}>Run task</button>
          )}
          <button className="link-button" onClick={() => void connectBrowser()} disabled={connecting || running}>
            {connecting ? "Starting browser..." : "Connect browser"}
          </button>
        </div>
        <p className="field-hint">
          The first time, use Connect browser and sign in to your accounts in the window that opens. WorkCrew asks before
          any change and never enters passwords or payment details for you.
        </p>
        {connectNote && <p className="notice">{connectNote}</p>}
        {error && <p className="error-banner inline">{error}</p>}
      </div>

      {steps.length > 0 && (
        <ul className="record-list automation-steps">
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

      {summary && (
        <div className={`automation-summary ${status}`} role="status">
          <strong>{status === "complete" ? "Done" : status === "stopped" ? "Stopped" : "Stopped early"}</strong>
          <p>{summary}</p>
        </div>
      )}

      {pending && <ApprovalModal action={pending.action} label={pending.label} onDecide={decide} />}
    </PanelShell>
  );
}
