import type { AutomationAction } from "@workcrew/contracts";

export function actionNeedsApproval(action: AutomationAction): boolean {
  if (action.kind === "finish") return false;
  // Running a shell command on the user's computer always requires approval.
  if (action.kind === "shell") return true;
  if (action.kind === "browser") {
    return new Set(["click", "fill", "type", "press", "select", "check", "uncheck", "click-selector", "fill-selector"]).has(action.command);
  }
  return new Set(["launch", "click", "set-text", "type-keys"]).has(action.command);
}

// The Permissions panel category an action belongs to, or null for actions with
// no toggle (reads, finish, shell). Used to decide whether "Always allow" covers
// this action.
export function permissionCategoryFor(action: AutomationAction): "browser-writes" | "windows-writes" | null {
  if (action.kind === "browser") return "browser-writes";
  if (action.kind === "windows") return "windows-writes";
  return null;
}

// Whether the in-app approval prompt must be shown before running this action,
// given the user's settings. This is the single policy the runner uses, modelled
// on Claude Code: when "Always allow" is off, every write action asks (and the
// user approves to continue). "Always allow" silences the asking, but only for
// categories the user has left on in Permissions; a category turned off keeps
// asking even with "Always allow" on. Shell is excluded here because the main
// process shows its own native confirmation that cannot be bypassed.
export function requiresApproval(
  action: AutomationAction,
  opts: { alwaysAllow: boolean; permissions: Record<string, boolean> }
): boolean {
  if (action.kind === "shell") return false;
  if (!actionNeedsApproval(action)) return false; // reads and finish never prompt
  const category = permissionCategoryFor(action);
  const categoryAllowed = category ? opts.permissions[category] !== false : true;
  const covered = opts.alwaysAllow && categoryAllowed;
  return !covered;
}

export function redactResult(value: string): string {
  return value
    .replace(/(password|passcode|secret|token|cookie|authorization)\s*[:=]\s*\S+/gi, "$1: [REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[PAYMENT NUMBER REDACTED]")
    .slice(0, 100_000);
}
