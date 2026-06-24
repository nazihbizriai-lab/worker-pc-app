import { useEffect, useRef, useState } from "react";
import type { RecordedEvent } from "@workcrew/contracts";

// Record clicks: the user demonstrates a task once in the automation browser or a
// desktop app. WorkCrew captures a readable trace of what they did and the model
// turns it into one reusable instruction. That instruction is placed in the chat
// so the user can review it, refine it (even by sending a screenshot), run it, and
// only then save it as a routine. Every run goes through the normal model loop, so
// it adapts to whatever is on screen that day instead of replaying exact clicks.

type Target = "browser" | "windows";
type Phase = "choose" | "recording" | "summarizing" | "review";

function friendly(error: unknown): string {
  let message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  message = message.replace(/^Error invoking remote method '[^']*':\s*/i, "").replace(/^[A-Za-z]*Error:\s*/, "").trim();
  if (/unsupported windows command/i.test(message)) {
    return "Windows recording needs the updated helper. Rebuild the app (or the Windows helper) and try again.";
  }
  // A raw validation error serializes to a JSON issues array; never show that.
  if (!message || message.startsWith("[") || message.startsWith("{")) {
    return "That recording could not be used. Please try again.";
  }
  return message;
}

export function RecorderDialog({
  onClose,
  onUseInChat
}: {
  onClose: () => void;
  onUseInChat: (task: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [target, setTarget] = useState<Target>("browser");
  const [task, setTask] = useState("");
  const [stepCount, setStepCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "recording" && phase !== "summarizing") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  // A simple elapsed-seconds timer while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function start(which: Target) {
    setTarget(which);
    setError("");
    setBusy(true);
    try {
      await window.workcrew.recorder.start(which);
      setPhase("recording");
    } catch (caught) {
      setError(friendly(caught));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError("");
    try {
      const { surface, events } = await window.workcrew.recorder.stop(target);
      if (!events.length) {
        setError("Nothing was captured. Start again and click the buttons or fields that make up your task.");
        setPhase("choose");
        return;
      }
      setStepCount(events.length);
      setPhase("summarizing");
      await writeInstruction(surface, events);
    } catch (caught) {
      setError(friendly(caught));
      setPhase("choose");
    } finally {
      setBusy(false);
    }
  }

  // Ask the model to turn the recorded trace into one reusable instruction. If it
  // cannot be reached, drop to the review step with an empty box so the user can
  // still write the instruction themselves and save it.
  async function writeInstruction(surface: Target, events: RecordedEvent[]) {
    try {
      const { task: written } = await window.workcrew.recorder.summarize(surface, events);
      setTask(written.trim());
      setPhase("review");
    } catch (caught) {
      setError(`${friendly(caught)} You can write the instruction yourself below.`);
      setPhase("review");
    }
  }

  // Send the instruction to the chat composer. The user reviews and runs it there,
  // then saves it as a routine from the chat once it works the way they want.
  function useInChat() {
    const trimmedTask = task.trim();
    if (trimmedTask.length < 3) {
      setError("Write a short instruction describing the task first.");
      return;
    }
    onUseInChat(trimmedTask);
  }

  return (
    <div className="modal-overlay" onMouseDown={() => { if (phase !== "recording" && phase !== "summarizing") onClose(); }}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorder-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="account-head">
          <h2 id="recorder-title">Record a task</h2>
          <button ref={closeRef} className="panel-close" onClick={onClose} aria-label="Close recorder">Close</button>
        </div>

        {error && <p className="error-banner inline">{error}</p>}

        {phase === "choose" && (
          <>
            <p className="modal-text">Do a task once. WorkCrew watches what you do, then writes a reusable instruction so it can do it again for you, adapting each time.</p>
            <div className="recorder-choice">
              <button className="recorder-target" onClick={() => void start("browser")} disabled={busy}>
                <strong>My browser</strong>
                <span>Record a task on a website.</span>
              </button>
              <button className="recorder-target" onClick={() => void start("windows")} disabled={busy}>
                <strong>A Windows app</strong>
                <span>Open the app first, then record the task in it.</span>
              </button>
            </div>
            {busy && <p className="field-hint">Getting ready...</p>}
          </>
        )}

        {phase === "recording" && (
          <div className="recorder-live">
            <span className="recorder-dot" aria-hidden="true" />
            <p className="modal-text">
              Recording your {target === "browser" ? "browser" : "app"}. Do the task now, then press Stop.
            </p>
            {target === "windows" && (
              <p className="field-hint">While recording, what you type is captured. Please do not enter passwords or other secrets until you press Stop.</p>
            )}
            <p className="field-hint">Recording time: {elapsed}s</p>
            <button className="primary full" onClick={() => void stop()} disabled={busy}>{busy ? "Finishing..." : "Stop recording"}</button>
          </div>
        )}

        {phase === "summarizing" && (
          <div className="recorder-live">
            <span className="chip-spinner" aria-label="Working" />
            <p className="modal-text">Writing your routine from {stepCount} recorded {stepCount === 1 ? "step" : "steps"}...</p>
          </div>
        )}

        {phase === "review" && (
          <>
            <p className="modal-text">Here is the instruction WorkCrew wrote from your recording. Edit it if you like, then add it to the chat to review, run, and refine it. You can save it as a routine from the chat once it works the way you want.</p>
            <textarea
              className="recorder-instruction"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="For example: Open Gmail, open the most recent unread email, and summarize it for me."
              rows={4}
              maxLength={2_000}
              aria-label="Task instruction"
            />
            <div className="account-buttons">
              <button className="secondary full" onClick={() => { setPhase("choose"); setTask(""); setError(""); }}>Record again</button>
              <button className="primary full" onClick={useInChat}>Add to chat</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
