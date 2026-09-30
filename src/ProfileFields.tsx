import { useRef, useState } from "react";
import { PlayerAvatar } from "./components";
import { preparePicture, type Profile } from "./profile";

export function ProfileFields({
  profile,
  onChange,
  onBusyChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const latest = useRef(profile);
  latest.current = profile;
  return (
    <div className="profile-fields">
      <label className="player-name-field">
        Your name
        <input
          value={profile.name}
          maxLength={24}
          placeholder="Enter your name"
          autoComplete="nickname"
          onChange={(event) => onChange({ ...profile, name: event.target.value })}
        />
      </label>
      <div className="profile-picture-field">
        <PlayerAvatar name={profile.name} picture={profile.picture} color={profile.color} size={76} />
        <div>
          <label className="photo-upload">
            {loading ? "Preparing picture…" : profile.picture ? "Change picture" : "Upload a picture"}
            <input
              type="file"
              accept="image/*"
              disabled={loading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setLoading(true);
                onBusyChange?.(true);
                setError("");
                try {
                  onChange({ ...latest.current, picture: await preparePicture(file) });
                } catch (problem) {
                  setError(problem instanceof Error ? problem.message : "Picture upload failed.");
                } finally {
                  setLoading(false);
                  onBusyChange?.(false);
                }
              }}
            />
          </label>
          {profile.picture && (
            <button
              type="button"
              className="photo-remove"
              onClick={() => onChange({ ...profile, picture: "" })}
            >
              Remove picture
            </button>
          )}
        </div>
      </div>
      {error && <p className="photo-error" role="status">{error}</p>}
      <p className="hint">Your name and picture are visible to the crew and saved on this device.</p>
    </div>
  );
}
