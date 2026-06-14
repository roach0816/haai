import { FormEvent, useState } from "react";
import type { AppearancePreference } from "../lib/appearance";
import { api } from "../lib/api";

interface Props {
  appearance: AppearancePreference;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onClose: () => void;
  username?: string;
}

export function ProfileModal({ appearance, onAppearanceChange, onClose, username }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2 id="profile-title">{username ?? "Local user"}</h2>
          </div>
          <button type="button" className="secondary icon-button" onClick={onClose} aria-label="Close profile">
            x
          </button>
        </div>

        <div className="field-group">
          <h3>Appearance</h3>
          <label>
            Mode
            <select
              value={appearance}
              onChange={(event) => onAppearanceChange(event.target.value as AppearancePreference)}
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p className="muted">Auto follows this device's system appearance.</p>
        </div>

        <form className="field-group" onSubmit={changePassword}>
          <h3>Change Password</h3>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {message ? <p className="success">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
