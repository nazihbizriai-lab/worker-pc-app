import { formatTokens } from "../lib/storage";
import type { UsageStatus } from "../lib/usage";

// A slim banner above the chat that appears as the token allowance runs low
// (amber) and once it is used up (red). It offers adding tokens and upgrading.
// Hidden entirely while there is comfortable headroom.
export function UsageBanner({
  status,
  onAddTokens,
  onUpgrade,
  upgrading
}: {
  status: UsageStatus;
  onAddTokens: () => void;
  onUpgrade: () => void;
  upgrading: boolean;
}) {
  if (status.level === "ok") return null;
  const empty = status.level === "empty";
  const message = empty
    ? "You have used all your tokens for this period."
    : `You are running low on tokens (${formatTokens(status.remaining)} left).`;

  return (
    <div className={`usage-banner ${empty ? "usage-banner-empty" : "usage-banner-low"}`} role="status" aria-live="polite">
      <span className="usage-banner-dot" aria-hidden="true" />
      <span className="usage-banner-text">{message}</span>
      <div className="usage-banner-actions">
        <button type="button" className="usage-banner-add" onClick={onAddTokens}>Add tokens</button>
        <button type="button" className="usage-banner-upgrade" onClick={onUpgrade} disabled={upgrading}>
          {upgrading ? "Upgrading..." : "Upgrade"}
        </button>
      </div>
    </div>
  );
}
