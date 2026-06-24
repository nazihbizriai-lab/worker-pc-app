import { useEffect, useRef, useState } from "react";
import { TOKEN_PACKS, tokenPackGrant, type SubscriptionState, type TokenPackId } from "@workcrew/contracts";
import { formatTokens } from "../lib/storage";

const PACK_ORDER: TokenPackId[] = ["small", "medium", "large"];

// Preset monthly caps for automatic top-ups, shown in tokens (never money).
const AUTO_RELOAD_LIMITS = [10_000_000, 25_000_000, 50_000_000, 100_000_000];

// A completed top-up returns the refreshed entitlement; a live-billing top-up
// returns { opened: true } because the purchase finishes in the browser.
function isEntitlement(value: unknown): value is SubscriptionState {
  return Boolean(value) && typeof value === "object" && "budgetMicrodollars" in (value as Record<string, unknown>);
}

// The token store: buy a one-time pack to keep working now, and optionally turn on
// auto-reload so tokens top up on their own when they run low. Mirrors what a
// usage-credits screen does, but always in tokens and with no provider names.
export function AddTokensDialog({
  entitlement,
  billingMode,
  onEntitlement,
  onClose
}: {
  entitlement: SubscriptionState;
  billingMode: string;
  onEntitlement: (state: SubscriptionState) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pack, setPack] = useState<TokenPackId>("medium");
  const [busy, setBusy] = useState<"buy" | "auto" | "portal" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  // Auto-reload form state, seeded from the saved settings.
  const [autoEnabled, setAutoEnabled] = useState(entitlement.autoReloadEnabled);
  const [autoPack, setAutoPack] = useState<TokenPackId>(entitlement.autoReloadPack);
  const [autoLimit, setAutoLimit] = useState<number>(
    entitlement.monthlyTopupLimitMicrodollars > 0 ? entitlement.monthlyTopupLimitMicrodollars : AUTO_RELOAD_LIMITS[1]!
  );

  const isStripe = billingMode === "stripe";

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function buy() {
    setBusy("buy");
    setError("");
    setNote("");
    try {
      const result = await window.workcrew.api.topup(pack);
      if (isEntitlement(result)) {
        onEntitlement(result);
        setNote(`Added ${formatTokens(tokenPackGrant(pack))} tokens.`);
      } else {
        setNote("Finish the purchase in your browser. Your tokens appear here when you come back.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add tokens. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAutoReload(next: { enabled: boolean; pack: TokenPackId; limit: number }) {
    setBusy("auto");
    setError("");
    setNote("");
    try {
      const result = await window.workcrew.api.autoReload({
        enabled: next.enabled,
        pack: next.pack,
        monthlyLimitMicrodollars: next.limit
      });
      onEntitlement(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save auto-reload.");
      // Revert the toggle on failure so the UI matches the saved state.
      setAutoEnabled(entitlement.autoReloadEnabled);
    } finally {
      setBusy(null);
    }
  }

  function toggleAuto(enabled: boolean) {
    setAutoEnabled(enabled);
    void saveAutoReload({ enabled, pack: autoPack, limit: autoLimit });
  }

  async function managePayment() {
    setBusy("portal");
    setError("");
    try {
      await window.workcrew.api.portal();
      setNote("Manage your payment method in the browser window that opened.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open payment settings.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <section
        className="modal tokens-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tokens-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="account-head">
          <h2 id="tokens-title">Need more tokens?</h2>
          <button ref={closeRef} className="panel-close" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="tokens-sub">Add tokens to keep working through this period. You only add what you choose.</p>

        <ul className="tokens-benefits">
          <li>Keep working without interruption</li>
          <li>Add only the tokens you want</li>
          <li>Set a monthly limit so spending stays in your control</li>
          <li>Turn on auto-reload to top up automatically when you run low</li>
        </ul>

        <div className="tokens-packs" role="radiogroup" aria-label="Choose a token pack">
          {PACK_ORDER.map((id) => {
            const item = TOKEN_PACKS[id];
            const selected = pack === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`token-pack ${selected ? "token-pack-on" : ""}`}
                onClick={() => setPack(id)}
              >
                {item.bonusPercent > 0 && <span className="token-pack-badge">+{item.bonusPercent}% bonus</span>}
                <strong>{formatTokens(tokenPackGrant(id))}</strong>
                <span className="token-pack-unit">tokens</span>
              </button>
            );
          })}
        </div>

        {note && <p className="notice" role="status">{note}</p>}
        {error && <p className="error-banner inline" role="alert">{error}</p>}

        <button className="primary full" onClick={() => void buy()} disabled={busy !== null}>
          {busy === "buy" ? "Adding..." : `Add ${formatTokens(tokenPackGrant(pack))} tokens`}
        </button>

        <div className="auto-reload-block">
          <label className="always-allow tokens-auto">
            <span className={`switch ${autoEnabled ? "switch-on" : ""}`} aria-hidden="true">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(event) => toggleAuto(event.target.checked)}
                disabled={busy !== null}
                aria-label="Turn on auto-reload"
              />
              <span className="switch-knob" />
            </span>
            <span className="always-allow-text">
              <strong>Auto-reload</strong>
              <small>Add tokens automatically when you run low, up to your monthly limit.</small>
            </span>
          </label>

          {autoEnabled && (
            <div className="auto-reload-controls">
              <label className="field-label" htmlFor="auto-pack">Add each time</label>
              <select
                id="auto-pack"
                value={autoPack}
                disabled={busy !== null}
                onChange={(event) => {
                  const value = event.target.value as TokenPackId;
                  setAutoPack(value);
                  void saveAutoReload({ enabled: autoEnabled, pack: value, limit: autoLimit });
                }}
              >
                {PACK_ORDER.map((id) => (
                  <option key={id} value={id}>{formatTokens(tokenPackGrant(id))} tokens</option>
                ))}
              </select>

              <label className="field-label" htmlFor="auto-limit">Monthly limit</label>
              <select
                id="auto-limit"
                value={autoLimit}
                disabled={busy !== null}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setAutoLimit(value);
                  void saveAutoReload({ enabled: autoEnabled, pack: autoPack, limit: value });
                }}
              >
                {AUTO_RELOAD_LIMITS.map((limit) => (
                  <option key={limit} value={limit}>Up to {formatTokens(limit)} tokens / month</option>
                ))}
              </select>

              {isStripe && (
                <p className="field-hint">
                  {entitlement.hasPaymentMethod
                    ? "Auto-reload uses your saved card."
                    : "Buy a pack once to save a card, or "}
                  {!entitlement.hasPaymentMethod && (
                    <button type="button" className="link-button" onClick={() => void managePayment()} disabled={busy !== null}>
                      add a payment method
                    </button>
                  )}
                  {!entitlement.hasPaymentMethod && "."}
                </p>
              )}
            </div>
          )}
        </div>

        {isStripe && entitlement.hasPaymentMethod && (
          <button className="link-button tokens-portal" onClick={() => void managePayment()} disabled={busy !== null}>
            Manage payment method
          </button>
        )}
      </section>
    </div>
  );
}
