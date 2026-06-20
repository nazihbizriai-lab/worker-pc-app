import { PERMISSION_CATEGORIES, type PermissionState, savePermissions } from "../lib/storage";
import { PanelShell } from "./PanelShell";

export function PermissionsPanel({
  permissions,
  onClose,
  onChange
}: {
  permissions: PermissionState;
  onClose: () => void;
  onChange: (next: PermissionState) => void;
}) {
  function toggle(id: string) {
    onChange(savePermissions({ ...permissions, [id]: !permissions[id] }));
  }

  return (
    <PanelShell
      title="Permissions"
      subtitle="WorkCrew asks before every write action. Sensitive categories always require approval and cannot be turned off."
      onClose={onClose}
    >
      <ul className="permission-list">
        {PERMISSION_CATEGORIES.map((category) => {
          const on = permissions[category.id] ?? category.defaultOn;
          return (
            <li key={category.id} className="permission-row">
              <div className="permission-text">
                <div className="permission-title">
                  <strong>{category.title}</strong>
                  {category.locked && <span className="tag tag-locked">Always asks</span>}
                </div>
                <p>{category.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`${category.title}${category.locked ? ", always required, locked on" : ""}`}
                className={`toggle ${on ? "toggle-on" : ""} ${category.locked ? "toggle-locked" : ""}`}
                disabled={category.locked}
                onClick={() => { if (!category.locked) toggle(category.id); }}
              >
                <span className="toggle-knob" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="panel-note">
        Turning an optional category off does not skip approval for sensitive steps. WorkCrew still asks before any
        browser or Windows write action, and consequential actions such as purchases, messages, and deletions are
        always confirmed.
      </p>
    </PanelShell>
  );
}
