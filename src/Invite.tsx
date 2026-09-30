import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { Button, Icon } from "./components";
export function Invite({ code }: { code: string }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("room", code);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url.href, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then((v) => {
      if (active) setQr(v);
    });
    return () => {
      active = false;
    };
  }, [code]);
  return (
    <div className="invite-panel">
      <p>
        Players on the same internet connection can press Join Lobby. Share this
        invitation if their lobby is not found or more than one is open.
      </p>
      {qr && (
        <img
          className="invite-qr"
          src={qr}
          alt={`Invitation QR for room ${code}`}
        />
      )}
      <span className="eyebrow">LOBBY CODE FOR MANUAL JOINING</span>
      <strong className="invitation-code" data-testid="room-code">
        {code}
      </strong>
      <input
        aria-label="Invitation link"
        value={url.href}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <Button
        tone="blue"
        onClick={() => {
          navigator.clipboard
            ?.writeText(url.href)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? "Copied!" : "Copy invitation link"}
      </Button>
      <p className="hint">Use the same Wi-Fi. Keep the host’s app open.</p>
    </div>
  );
}
export function JoinPanel({
  onJoin,
  disabled,
  joining,
}: {
  onJoin: (code: string) => void;
  disabled: boolean;
  joining: boolean;
}) {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!scanning) return;
    let active = true,
      stream: MediaStream | undefined,
      frame = 0;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    const stop = () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        stream = s;
        if (!active) {
          stop();
          return;
        }
        video.current!.srcObject = s;
        await video.current!.play();
        const scan = () => {
          if (!active) return;
          const v = video.current;
          if (v && v.readyState >= 2 && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(data.data, data.width, data.height);
            if (qr) {
              try {
                const url = new URL(qr.data);
                const c = url.searchParams.get("room");
                if (
                  url.origin !== location.origin ||
                  !c ||
                  !/^[A-HJ-NP-Z2-9]{8}$/.test(c)
                )
                  throw Error();
                stop();
                setScanning(false);
                setCode(c);
                onJoin(c);
                return;
              } catch {
                setError("Scan an invitation for this Meeting Room app.");
              }
            }
          }
          frame = requestAnimationFrame(scan);
        };
        scan();
      })
      .catch(() => {
        setError("Camera unavailable. Enter the lobby code instead.");
        setScanning(false);
      });
    return stop;
  }, [scanning]);
  return (
    <section className="panel join-panel">
      <Icon name="users" size={35} />
      <h2>Join your crew</h2>
      <p>If your lobby was not found, scan its invitation or enter its code.</p>
      <label className="player-name-field">
        Lobby code
        <input
          value={code}
          maxLength={10}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABCD1234"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <Button
        tone="blue"
        disabled={disabled || joining || code.replace(/[ -]/g, "").length !== 8}
        onClick={() => onJoin(code)}
      >
        {joining ? "Connecting to your crew…" : "Join with code"}
      </Button>
      {navigator.mediaDevices && (
        <Button
          tone="subtle"
          disabled={disabled || joining}
          onClick={() => {
            setError("");
            setScanning((v) => !v);
          }}
        >
          {scanning ? "Stop camera" : "Scan invitation QR"}
        </Button>
      )}
      {scanning && (
        <video ref={video} muted playsInline className="qr-camera" />
      )}
      {error && <p role="status">{error}</p>}
      <p className="hint">
        Keep everyone on the same Wi-Fi. No reply QR needed.
      </p>
    </section>
  );
}
