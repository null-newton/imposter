import { useEffect, useRef, type ReactNode } from "react";
import { colors, hex, type Player } from "./shared";
export function Avatar({
  color = "Red",
  size = 48,
  dead = false,
}: {
  color?: string;
  size?: number;
  dead?: boolean;
}) {
  const c = hex[colors.indexOf(color)] || hex[0];
  return (
    <svg
      className={`avatar ${dead ? "ghost" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 72 80"
      aria-hidden="true"
    >
      <path
        d="M15 30H11Q5 30 5 39v24q0 5 6 5h8"
        fill={c}
        stroke="#050a12"
        strokeWidth="5"
      />
      <path
        d="M19 69v6h15l3-12h9v12h15V31Q61 8 39 8 17 8 17 34v28q0 6 2 7Z"
        fill={c}
        stroke="#050a12"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M22 52q11 12 35 2v12H42l-8-3-3 9h-9Z" fill="#000" opacity=".2" />
      <path
        d="M37 22h20q10 1 10 13T55 48H38q-12-1-12-13t11-13Z"
        fill="#8fc9df"
        stroke="#050a12"
        strokeWidth="5"
      />
      <path d="M36 26h20q5 0 6 6H34q-4-4 2-6Z" fill="#effaff" />
      <path
        d="M31 38q12 8 30-1"
        fill="none"
        stroke="#4f89a4"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    wifi: (
      <>
        <path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0" />
        <circle cx="12" cy="20" r="1" />
      </>
    ),
    arrow: <path d="m14 5-7 7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 12-12" />,
    settings: (
      <>
        <path d="m9 3-1 3-3 1-1 4 2 2-1 3 3 3 3-1 3 2 3-2 3-1 1-4-2-2V7l-4-2-2-2Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    crown: <path d="m3 7 5 4 4-7 4 7 5-4-2 12H5Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: (
      <>
        <path d="m4 16-1 5 5-1L20 8l-4-4Z M13 7l4 4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M2 21v-4q0-5 7-5t7 5v4M17 5q6 3 0 6M19 14q4 1 3 7" />
      </>
    ),
    bolt: <path d="m14 2-9 12h6l-1 8 9-13h-6Z" />,
    volume: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5ZM16 8q4 4 0 8M19 4q8 8 0 16" />
      </>
    ),
    logout: (
      <>
        <path d="M9 4H3v16h6M8 12h13m-4-4 4 4-4 4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.bolt}
    </svg>
  );
}
export function Button({
  children,
  onClick,
  tone = "green",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`button ${tone} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function PlayerRow({
  p,
  host,
  you,
  children,
  onClick,
}: {
  p: Player;
  host?: boolean;
  you?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Avatar color={p.color} size={43} dead={!p.alive} />
      <div className="player-info">
        <strong>{p.name}</strong>
        <small>
          {!p.alive
            ? "Ejected"
            : p.connected
              ? "Connected"
              : p.deviceId
                ? "Reconnecting…"
                : "Waiting for player"}
        </small>
      </div>
      {you && <span className="badge">YOU</span>}
      {host && (
        <span className="crown" title="Host">
          <Icon name="crown" />
        </span>
      )}
      {children}
    </>
  );
  return onClick ? (
    <button className="player-row" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="player-row">{content}</div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const before = document.activeElement as HTMLElement;
    return () => before?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Timer({
  deadline,
  now,
  total,
  label,
}: {
  deadline: number;
  now: number;
  total: number;
  label: string;
}) {
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div className={`timer ${left <= 10 ? "urgent" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </strong>
      </div>
      <div className="progress">
        <i
          style={{
            width: `${Math.min(100, (left / Math.max(1, total)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
export function Hero({ emergency = false }: { emergency?: boolean }) {
  return (
    <div className={`hero-art ${emergency ? "emergency-art" : ""}`}>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="planet" />
      <span className="art-star s1">✦</span>
      <span className="art-star s2">✧</span>
      <span className="art-star s3">+</span>
      <div className="hero-crewmate">
        <Avatar size={205} />
      </div>
      <div className="small-crew blue-crew">
        <Avatar color="Blue" size={82} />
      </div>
      <div className="small-crew yellow-crew">
        <Avatar color="Yellow" size={65} />
      </div>
      <div className="platform">
        <div className="emergency-base">
          <div className="emergency-button" />
        </div>
      </div>
      <div className="floating-tag">
        <span className="live-dot" /> CREW ASSEMBLY
      </div>
    </div>
  );
}
