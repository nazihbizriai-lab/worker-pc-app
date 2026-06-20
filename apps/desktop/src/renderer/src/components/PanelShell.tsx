import { useEffect, useRef } from "react";

// A side panel that slides over the workspace. It traps Escape to close,
// labels itself for assistive tech, and moves focus to the close control.

export function PanelShell({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="panel-overlay" onMouseDown={onClose}>
      <section
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="panel-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeRef} className="panel-close" onClick={onClose} aria-label="Close panel">
            Close
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  );
}
