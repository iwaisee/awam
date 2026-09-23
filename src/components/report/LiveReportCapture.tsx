"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SwitchCamera,
  X,
  Zap,
} from "lucide-react";
import type { LiveGeoLock } from "@/types/report";
import { isOutsidePilotDistrict } from "@/lib/pilotBoundary";
import { lookupLocality } from "@/lib/wardLookup";

/* Proof-of-Presence capture flow: a live GPS fix gates the camera, the
   full-screen viewfinder overlays the locked telemetry, and the shutter burns
   a tamper-evident verification band (coordinates, PKT timestamp, locality,
   SHA-256 payload ID) into the frame before it can be attached. Gallery /
   file-picker uploads are not offered — the only paths in are the WebRTC
   stream or the mobile capture="environment" input, both of which capture
   live sensor frames.

   The viewfinder is a native-feeling camera window portalled to <body>:
   rear camera by default with a flip toggle, torch support when the track
   exposes it, watchPosition-driven accuracy pill, locality badge, and
   haptic shutter feedback. */

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0, // never reuse a cached fix — the lock must be live
};

/** At or under this the fix reads as locked (emerald pill); above it the
    citizen sees an amber "still acquiring" advisory instead of a hard block. */
const GPS_ACCURACY_LIMIT_M = 40;

type GpsStatus = "idle" | "requesting" | "locked" | "inaccurate" | "denied";
type CameraStatus = "off" | "starting" | "live" | "error";
type Facing = "environment" | "user";

interface VerifiedCapture {
  file: File;
  previewUrl: string;
  geo: LiveGeoLock;
  locality: string;
  capturedAt: string;
}

interface LiveReportCaptureProps {
  /** The capture already confirmed into the wizard state (survives step
      navigation — this component unmounts between steps). */
  storedFile: File | null;
  storedGeo: LiveGeoLock | null;
  storedCapturedAt: string | null;
  onConfirm: (capture: {
    file: File;
    geo: LiveGeoLock;
    capturedAt: string;
  }) => void;
  onRemove: () => void;
}

/** "32.4945° N, 74.5229° E" */
function formatCoords(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}

function formatPkClock(at: number | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(at));
}

/** Keyless OpenStreetMap embed centered on the locked fix. */
function osmEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.0015;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ]
    .map((n) => n.toFixed(5))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)}%2C${longitude.toFixed(5)}`;
}

/** Short SHA-256 identity of the burned payload (coordinates + accuracy +
    capture instant). Tampering with the pixels invalidates the match. Empty
    string when SubtleCrypto is unavailable (insecure context). */
async function payloadId(
  latitude: number,
  longitude: number,
  accuracyMeters: number,
  capturedAt: string
): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle) return "";
    const data = new TextEncoder().encode(
      [latitude, longitude, accuracyMeters, capturedAt].join("|")
    );
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

const PK_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const PK_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const UI_FONT = '"Noto Sans Arabic", ui-sans-serif, system-ui, sans-serif';

/** Measure `text` at `font(size)` and report its rendered width. */
function textWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  size: number
): number {
  ctx.font = font(size);
  return ctx.measureText(text).width;
}

/** Largest size at or below `start` at which `text` still fits `maxWidth`.
    Floors at 9px — past that the stamp is unreadable either way. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  start: number,
  maxWidth: number
): number {
  let size = Math.max(9, start);
  ctx.font = font(size);
  while (size > 9 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = font(size);
  }
  return size;
}

interface StampItem {
  text: string;
  size: number;
  font: (size: number) => string;
  color: string;
  align: "left" | "right";
}

/** Burn the permanent verification band into the bottom of the frame: a
    dark gradient scrim carrying the verified seal (logo), bilingual title,
    raw coordinates with accuracy, PKT date/time, locality, and the short
    payload ID. Runs at sensor resolution so the badge stays crisp.

    Type size keys off the *short* edge, not the height — a portrait phone
    frame is tall and narrow, and a height-driven size overflows the width
    and collides the left and right columns. Each line is measured, and when
    the two-column pairing cannot fit the band falls back to a stacked
    single-column layout. */
async function drawVerificationBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  geo: LiveGeoLock,
  locality: string,
  capturedAt: string
): Promise<void> {
  const short = Math.min(width, height);
  const unit = Math.min(26, Math.max(11, Math.round(short * 0.019)));
  const pad = Math.min(36, Math.max(12, Math.round(short * 0.028)));
  const colGap = Math.round(unit * 0.9);
  const lineH = Math.round(unit * 1.5);
  const contentWidth = width - pad * 2;

  const title = "صدائے عوام • SADA-E-AWAM VERIFIED REPORT";
  const stamp = `${PK_DATE_FMT.format(new Date(capturedAt))} • ${PK_TIME_FMT.format(new Date(capturedAt))} PKT`;
  const gpsLine = `GPS: ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} (Accurate to ±${Math.round(geo.accuracyMeters)}m)`;
  const locLine = `Locality: ${locality}`;

  const uiBold = (s: number) => `bold ${s}px ${UI_FONT}`;
  const monoBold = (s: number) => `bold ${s}px ${MONO_FONT}`;
  const mono = (s: number) => `${s}px ${MONO_FONT}`;

  const id = await payloadId(
    geo.latitude,
    geo.longitude,
    geo.accuracyMeters,
    capturedAt
  );
  const hashSize = Math.max(9, Math.round(unit * 0.66));

  const sealR = Math.round(unit * 0.62);
  const sealCx = pad + sealR;
  const textX = sealCx + sealR + Math.round(unit * 0.7);
  const sealBlock = textX - pad;

  const titleTarget = Math.round(unit * 1.15);
  const twoCol =
    textWidth(ctx, title, uiBold, titleTarget) +
      sealBlock +
      colGap +
      textWidth(ctx, stamp, monoBold, unit) <=
      contentWidth &&
    textWidth(ctx, gpsLine, mono, unit) +
      colGap +
      textWidth(ctx, locLine, mono, unit) <=
      contentWidth;

  const rows: StampItem[][] = twoCol
    ? [
        [
          {
            text: title,
            size: titleTarget,
            font: uiBold,
            color: "rgba(255,255,255,0.97)",
            align: "left",
          },
          {
            text: stamp,
            size: unit,
            font: monoBold,
            color: "rgba(255,255,255,0.95)",
            align: "right",
          },
        ],
        [
          {
            text: gpsLine,
            size: unit,
            font: mono,
            color: "rgba(255,255,255,0.85)",
            align: "left",
          },
          {
            text: locLine,
            size: unit,
            font: mono,
            color: "rgba(255,255,255,0.82)",
            align: "right",
          },
        ],
      ]
    : [
        [
          {
            text: title,
            size: fitSize(ctx, title, uiBold, titleTarget, contentWidth - sealBlock),
            font: uiBold,
            color: "rgba(255,255,255,0.97)",
            align: "left",
          },
        ],
        [
          {
            text: stamp,
            size: fitSize(ctx, stamp, monoBold, unit, contentWidth),
            font: monoBold,
            color: "rgba(255,255,255,0.95)",
            align: "left",
          },
        ],
        [
          {
            text: gpsLine,
            size: fitSize(ctx, gpsLine, mono, unit, contentWidth),
            font: mono,
            color: "rgba(255,255,255,0.85)",
            align: "left",
          },
        ],
        [
          {
            text: locLine,
            size: fitSize(ctx, locLine, mono, unit, contentWidth),
            font: mono,
            color: "rgba(255,255,255,0.82)",
            align: "left",
          },
        ],
      ];

  const hashRow = id ? Math.round(hashSize * 1.7) : 0;
  const contentH = lineH * rows.length + hashRow;
  const scrimTop = height - Math.round(contentH + pad * 1.9);

  /* Gradient dark scrim across the bottom of the frame. */
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, height);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(0.35, "rgba(0,0,0,0.7)");
  scrim.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, width, height - scrimTop);

  const hashBaseline = height - Math.round(pad * 0.55);
  const firstBaseline = hashBaseline - hashRow - lineH * (rows.length - 1);

  /* Verified seal — emerald disc with a white check, left of the title row. */
  const titleSize = rows[0][0].size;
  const sealCy = firstBaseline - Math.round(titleSize * 0.36);
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, sealR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, sealR * 0.28);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(sealCx - sealR * 0.45, sealCy + sealR * 0.02);
  ctx.lineTo(sealCx - sealR * 0.1, sealCy + sealR * 0.38);
  ctx.lineTo(sealCx + sealR * 0.48, sealCy - sealR * 0.32);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  rows.forEach((items, index) => {
    const baseline = firstBaseline + index * lineH;
    items.forEach((item) => {
      ctx.font = item.font(item.size);
      ctx.fillStyle = item.color;
      if (item.align === "right") {
        ctx.textAlign = "right";
        ctx.fillText(item.text, width - pad, baseline);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(item.text, index === 0 ? textX : pad, baseline);
      }
    });
  });

  /* Payload ID — tamper-evidence anchor, centered on the band's bottom edge. */
  if (id) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `${hashSize}px ${MONO_FONT}`;
    ctx.fillText(`ID ${id}`, width / 2, hashBaseline);
  }
  ctx.textAlign = "left";
}

function TelemetryChip({
  icon,
  children,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "neutral" | "verified" | "warning";
}) {
  const toneClass =
    tone === "verified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-warning/30 bg-warning-tint text-warning"
        : "border-line bg-canvas text-ink";
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight ${toneClass}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** One labelled telemetry field in the review sheet — label over value so a
    long coordinate string never collides with its neighbours on a narrow
    phone screen the way the wrapping pill row did. */
function DetailCell({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-xl bg-white/[0.07] px-2.5 py-2">
      <span className="mt-0.5 shrink-0 text-emerald-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/50">
          {label}
        </span>
        <span
          className={`block truncate text-xs font-bold text-white ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

export default function LiveReportCapture({
  storedFile,
  storedGeo,
  storedCapturedAt,
  onConfirm,
  onRemove,
}: LiveReportCaptureProps) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [geo, setGeo] = useState<LiveGeoLock | null>(null);
  const [locality, setLocality] = useState<string | null>(null);
  const [gpsDeniedReason, setGpsDeniedReason] = useState<
    "permission" | "unavailable" | "unsupported" | null
  >(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("off");
  const [cameraError, setCameraError] = useState<
    "permission" | "no-camera" | "unsupported" | "failed" | null
  >(null);
  const [capture, setCapture] = useState<VerifiedCapture | null>(null);
  const [clock, setClock] = useState("");
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<number | null>(null);
  const cameraStartedRef = useRef(false);

  const isTouchDevice = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
    []
  );

  /* The confirmed capture renders from wizard state, so its preview URL
     follows the stored File. */
  const storedPreviewUrl = useMemo(
    () => (storedFile ? URL.createObjectURL(storedFile) : null),
    [storedFile]
  );
  useEffect(() => {
    return () => {
      if (storedPreviewUrl) URL.revokeObjectURL(storedPreviewUrl);
    };
  }, [storedPreviewUrl]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus("off");
  }, []);

  const clearWatch = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  /* Leaving the step (or the page) mid-viewfinder must release the sensor
     and the GPS watch. */
  useEffect(() => {
    return () => {
      stopCamera();
      clearWatch();
    };
  }, [stopCamera, clearWatch]);

  const closeOverlay = useCallback(() => {
    stopCamera();
    clearWatch();
    setOverlayOpen(false);
    if (capture) {
      // Abandoning the review discards the unconfirmed shot.
      URL.revokeObjectURL(capture.previewUrl);
      setCapture(null);
    }
    setGpsStatus("idle");
    setGeo(null);
    setLocality(null);
    setGpsDeniedReason(null);
    setCameraError(null);
  }, [stopCamera, clearWatch, capture]);

  /* While the camera overlay is up: lock page scroll, close on Escape, and
     put keyboard focus on the dialog itself. */
  useEffect(() => {
    if (!overlayOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKeyDown);
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [overlayOpen, closeOverlay]);

  /* Start (or restart) the sensor stream for a facing mode. The previous
     stream is only released once the new one is in hand, so a failed lens
     switch never leaves the citizen without a working viewfinder. */
  const startStream = useCallback(
    async (mode: Facing): Promise<boolean> => {
      setCameraError(null);
      setTorchOn(false);
      setTorchSupported(false);
      setCameraStatus("starting");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("unsupported"), {
            name: "NotSupportedError",
          });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        const capabilities = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(capabilities?.torch));
        setCameraStatus("live");
        return true;
      } catch (error) {
        if (streamRef.current) {
          // Failed lens switch — the previous stream is untouched, resume it.
          setCameraStatus("live");
          return false;
        }
        streamRef.current = null;
        setCameraStatus("error");
        const name = error instanceof DOMException ? error.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "permission"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "no-camera"
              : name === "NotSupportedError"
                ? "unsupported"
                : "failed"
        );
        return false;
      }
    },
    []
  );

  const openCamera = useCallback(
    (mode: Facing = "environment") => startStream(mode),
    [startStream]
  );

  /* Attach + start the stream once the viewfinder (and its <video>) mounts. */
  useEffect(() => {
    if (cameraStatus !== "live") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playback = video.play();
    return () => {
      playback?.catch(() => {
        /* Autoplay races are harmless — the user gesture already happened. */
      });
    };
  }, [cameraStatus]);

  /* Some virtual/permission-walled cameras attach a stream that never
     delivers frames — after a grace period, surface the camera-error card
     instead of leaving a dead shutter over a black viewfinder. */
  useEffect(() => {
    if (cameraStatus !== "live") return;
    const watchdog = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && (video.readyState < 2 || video.videoWidth === 0)) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraStatus("error");
        setCameraError("failed");
      }
    }, 5000);
    return () => window.clearTimeout(watchdog);
  }, [cameraStatus]);

  /* Live PKT clock for the HUD header, ticking only while the shutter is up. */
  useEffect(() => {
    if (cameraStatus !== "live") return;
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Karachi",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date())
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [cameraStatus]);

  const startFlow = useCallback(() => {
    clearWatch();
    setGpsDeniedReason(null);
    setCameraError(null);
    setCameraStatus("off");
    setTorchOn(false);
    setTorchSupported(false);
    setFacing("environment"); // native cameras always reopen on the rear lens
    setOverlayOpen(true); // the full-screen camera window owns the flow
    setGpsStatus("requesting");
    cameraStartedRef.current = false;
    if (!("geolocation" in navigator)) {
      setGpsStatus("denied");
      setGpsDeniedReason("unsupported");
      return;
    }
    /* Continuous watch: the HUD accuracy pill and locality badge track the
       citizen in real time, and the freshest fix rides into the watermark. */
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lock: LiveGeoLock = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? 0,
          lockedAt: position.timestamp,
        };
        setGeo(lock);
        setGpsStatus(
          lock.accuracyMeters > GPS_ACCURACY_LIMIT_M ? "inaccurate" : "locked"
        );
        setLocality(lookupLocality(lock.latitude, lock.longitude));
        if (!cameraStartedRef.current) {
          cameraStartedRef.current = true;
          void openCamera();
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          clearWatch();
          setGpsStatus("denied");
          setGpsDeniedReason("permission");
        } else if (!cameraStartedRef.current) {
          // No usable fix within the budget — surface it instead of spinning.
          clearWatch();
          setGpsStatus("denied");
          setGpsDeniedReason("unavailable");
        }
      },
      GPS_OPTIONS
    );
  }, [clearWatch, openCamera]);

  const flipCamera = useCallback(() => {
    if (cameraStatus !== "live") return; // no working lens to flip from
    const next: Facing = facing === "environment" ? "user" : "environment";
    void startStream(next).then((ok) => {
      // Facing only commits when the new lens actually started streaming;
      // a failed flip resumes the rear camera unchanged.
      if (ok) setFacing(next);
    });
  }, [cameraStatus, facing, startStream]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      /* Track lost its torch mid-stream — leave the toggle as it was. */
    }
  }, [torchOn]);

  const handleShutter = async () => {
    const video = videoRef.current;
    const lock = geo;
    if (!video || !lock || cameraStatus !== "live" || video.videoWidth === 0)
      return;

    /* Native shutter feedback: haptic tick + white flash + frozen frame. */
    navigator.vibrate?.(50);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 320);
    try {
      video.pause();
    } catch {
      /* Freeze is best-effort; drawImage still grabs the current frame. */
    }

    const capturedAt = new Date().toISOString();
    const localityLabel = locality ?? "Sialkot District";

    /* Project the full sensor frame at native resolution. */
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraStatus("error");
      setCameraError("failed");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await drawVerificationBand(
      ctx,
      canvas.width,
      canvas.height,
      lock,
      localityLabel,
      capturedAt
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraStatus("error");
          setCameraError("failed");
          return;
        }
        stopCamera();
        setCapture({
          file: new File([blob], `sada-e-awam-live-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
          previewUrl: URL.createObjectURL(blob),
          geo: lock,
          locality: localityLabel,
          capturedAt,
        });
      },
      "image/jpeg",
      0.92
    );
  };

  /* Mobile fallback: capture="environment" launches the rear camera in the
     OS camera app — no gallery is reachable from that picker. */
  const handleNativeCapture = async (file: File) => {
    const lock = geo;
    if (!lock) return;
    const capturedAt = new Date().toISOString();
    const localityLabel = locality ?? "Sialkot District";
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas-unavailable");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await drawVerificationBand(
        ctx,
        canvas.width,
        canvas.height,
        lock,
        localityLabel,
        capturedAt
      );
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setCapture({
            file: new File([blob], `sada-e-awam-live-${Date.now()}.jpg`, {
              type: "image/jpeg",
            }),
            previewUrl: URL.createObjectURL(blob),
            geo: lock,
            locality: localityLabel,
            capturedAt,
          });
        },
        "image/jpeg",
        0.92
      );
    } catch {
      /* Decode failed — keep the raw capture; the GPS telemetry is already
         locked and travels with the report either way. */
      setCapture({
        file,
        previewUrl: URL.createObjectURL(file),
        geo: lock,
        locality: localityLabel,
        capturedAt,
      });
    }
  };

  const retake = () => {
    if (capture) URL.revokeObjectURL(capture.previewUrl);
    setCapture(null);
    onRemove();
    setGeo(null);
    setLocality(null);
    setGpsStatus("idle");
    startFlow(); // fresh fix + fresh camera — presence is re-proven
  };

  const confirm = () => {
    if (!capture) return;
    onConfirm({
      file: capture.file,
      geo: capture.geo,
      capturedAt: capture.capturedAt,
    });
    URL.revokeObjectURL(capture.previewUrl);
    setCapture(null);
    setOverlayOpen(false);
  };

  const boundaryWarningGeo = capture?.geo ?? (storedFile ? storedGeo : null);
  const outsidePilot =
    boundaryWarningGeo !== null &&
    isOutsidePilotDistrict(
      boundaryWarningGeo.latitude,
      boundaryWarningGeo.longitude
    );

  /* --------------------------------- render -------------------------------- */

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-ink">
          Live on-site photo proof{" "}
          <span className="urdu text-ink-soft font-normal">
            موجودگی کا ثبوت
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-5 text-ink-soft">
          Gallery uploads are disabled — the photo must be captured live with
          your GPS coordinates so dispatch crews reach the exact spot.
        </p>
      </div>
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
    </div>
  );

  const gpsDeniedCard = (
    <div
      role="alert"
      className="space-y-2 rounded-card-lg border border-danger/30 bg-danger-tint p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-danger">
        <ShieldAlert className="h-4 w-4" />
        Location Access Required
        <span className="urdu font-normal">لوکیشن کی اجازت درکار ہے</span>
      </p>
      <p className="text-xs leading-5 text-ink-soft">
        {gpsDeniedReason === "permission"
          ? "Municipal dispatch crews rely on exact GPS coordinates to locate broken wires, drains, and road hazards. Please enable Location Services in your browser settings to proceed."
          : gpsDeniedReason === "unsupported"
            ? "This browser cannot share GPS coordinates. Please switch to a browser with location support (Chrome, Safari, or Edge) to file a verified report."
            : "We couldn't get a live GPS fix. Make sure Location Services are on for this device and browser, then try again."}
      </p>
      {gpsDeniedReason !== "unsupported" && (
        <div className="space-y-2">
          <button
            type="button"
            aria-expanded={showLocationHelp}
            onClick={() => setShowLocationHelp((open) => !open)}
            className="flex items-center gap-1.5 rounded-btn border-2 border-danger px-4 py-2 text-xs font-bold text-danger hover:bg-danger hover:text-white"
          >
            <Navigation className="h-3.5 w-3.5" />
            How to Enable Location
          </button>
          {showLocationHelp && (
            <div className="space-y-2 rounded-btn bg-white/70 p-3 text-xs leading-5 text-ink-soft">
              <p className="font-bold text-ink">
                If you chose “Block” earlier, the browser will not ask
                again — reset the permission manually:
              </p>
              <p>
                <span className="font-bold text-ink">
                  Desktop — Chrome / Edge:
                </span>{" "}
                click the lock icon at the left of the address bar → Site
                settings → Location → Allow → reload this page.
              </p>
              <p>
                <span className="font-bold text-ink">Safari (macOS):</span>{" "}
                Safari menu → Settings → Websites → Location → set
                localhost to Allow. Also check System Settings → Privacy
                &amp; Security → Location Services is on for your browser.
              </p>
              <p>
                <span className="font-bold text-ink">Android:</span> tap
                the lock icon beside the address bar → Permissions →
                Location → Allow, then reload.
              </p>
              <p>
                <span className="font-bold text-ink">iPhone:</span> iOS
                Settings → Apps → Safari (or Chrome) → Location → While
                Using the App, then reload.
              </p>
              <p className="text-ink-muted">
                No prompt appearing at all? Some embedded preview panes
                auto-deny location — open this page in a full browser tab.
              </p>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={startFlow}
        className="flex items-center gap-1.5 rounded-btn border-2 border-danger px-4 py-2 text-xs font-bold text-danger hover:bg-danger hover:text-white"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        Try Again
      </button>
    </div>
  );

  const cameraErrorCard = (
    <div
      role="alert"
      className="space-y-2 rounded-card-lg border border-line bg-canvas p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <CameraOff className="h-4 w-4 text-danger" />
        Camera Unavailable
      </p>
      <p className="text-xs leading-5 text-ink-soft">
        {cameraError === "permission"
          ? "Camera access was blocked. Allow camera permission for this site (address-bar lock → Site settings → Camera) and try again."
          : cameraError === "no-camera"
            ? "No rear camera was found on this device."
            : cameraError === "unsupported"
              ? "This browser cannot open a live camera stream. HTTPS is required for camera access."
              : "The live camera could not be started. Close other apps using the camera and try again."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openCamera(facing)}
          className="flex items-center gap-1.5 rounded-btn bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
        >
          <Camera className="h-3.5 w-3.5" />
          Retry Camera
        </button>
        {isTouchDevice && (
          <button
            type="button"
            onClick={() => captureInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-btn border-2 border-line px-4 py-2 text-xs font-bold text-ink-soft hover:border-ink-muted hover:text-ink"
          >
            <Camera className="h-3.5 w-3.5" />
            Use Device Camera App
          </button>
        )}
      </div>
    </div>
  );

  const cameraStarting = cameraStatus === "starting";
  const cameraLive = cameraStatus === "live";

  /* Real-time accuracy pill — emerald once inside the precision budget,
     amber while the fix is still coarse. */
  const accuracyPill = geo ? (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-md">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            gpsStatus === "locked" ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            gpsStatus === "locked" ? "bg-emerald-500" : "bg-amber-400"
          }`}
        />
      </span>
      {gpsStatus === "locked"
        ? `GPS LOCKED (±${Math.round(geo.accuracyMeters)}m)`
        : `ACQUIRING ACCURACY (±${Math.round(geo.accuracyMeters)}m)`}
    </span>
  ) : null;

  return (
    <div className="space-y-3">
      {header}

      {/* Confirmed earlier (step revisits) — compact verified summary. */}
      {storedFile && storedGeo ? (
        <div className="space-y-3">
          {outsidePilot && (
            <p className="flex items-start gap-2 rounded-btn border border-warning/30 bg-warning-tint px-3 py-2.5 text-xs font-semibold leading-5 text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Coordinates indicate you are outside Sialkot pilot boundaries. This
              report will be audited before dispatch.
            </p>
          )}
          <div className="flex gap-3 rounded-card-lg border border-emerald-200 bg-emerald-50/60 p-3">
            {storedPreviewUrl && (
              <img
                src={storedPreviewUrl}
                alt="Verified live capture of the issue"
                className="h-20 w-20 shrink-0 rounded-btn border border-emerald-200 object-cover"
              />
            )}
            <div className="min-w-0 space-y-1.5">
              <TelemetryChip
                tone="verified"
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
              >
                Presence Verified: Citizen is on site
              </TelemetryChip>
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-ink-soft">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {formatCoords(storedGeo.latitude, storedGeo.longitude)}{" "}
                  (±{Math.round(storedGeo.accuracyMeters)}m)
                </span>
                {storedCapturedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatPkClock(storedCapturedAt)} PKT
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={retake}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                Retake Photo
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Idle entry point — everything else happens in the overlay. */
        <div className="space-y-3 rounded-card-lg border-2 border-dashed border-line bg-canvas p-5 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-tint text-primary">
            <Camera className="h-5 w-5" />
          </span>
          <p className="text-xs leading-5 text-ink-soft">
            A stamped GPS fix + live shutter proof is required before this
            report can move to review.
          </p>
          <button
            type="button"
            onClick={startFlow}
            className="mx-auto flex w-full flex-col items-center justify-center gap-1 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(15,81,50,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-[0_7px_18px_rgba(15,81,50,0.4)] active:translate-y-0 active:scale-[0.98] sm:flex-row sm:gap-2"
          >
            <span className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Snap Live Photo
            </span>
            <span className="urdu text-xs font-normal">براہِ راست تصویر لیں</span>
          </button>
        </div>
      )}

      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleNativeCapture(file);
        }}
      />

      {/* ---------------------- full-screen camera window ---------------------- */}
      {overlayOpen &&
        createPortal(
          <div
            ref={overlayRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Live verified camera"
            className="fixed inset-0 z-[100] flex animate-overlay-in flex-col bg-black outline-none"
          >
            {capture ? (
              /* Just captured — Review Evidence, camera-app style. */
              <div className="animate-fade-rise flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-4 py-3 text-white">
                  <p className="text-sm font-bold">Review Evidence</p>
                  <button
                    type="button"
                    onClick={closeOverlay}
                    aria-label="Discard and close camera"
                    className="rounded-full bg-white/10 p-2 backdrop-blur-md transition-colors hover:bg-white/25"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-2">
                  <img
                    src={capture.previewUrl}
                    alt="Live captured incident evidence with verification stamp"
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>
                {/* The details sheet is height-capped and scrolls on its own;
                    unbounded, it crushed the portrait photo into a thumbnail
                    on a phone. Actions stay pinned below it. */}
                <div className="flex max-h-[54vh] shrink-0 flex-col sm:max-h-none">
                  <div className="min-h-0 space-y-2.5 overflow-y-auto px-4 pb-1">
                    <div className="grid grid-cols-2 gap-1.5">
                      <DetailCell
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        label="Coordinates"
                        value={formatCoords(
                          capture.geo.latitude,
                          capture.geo.longitude
                        )}
                        mono
                      />
                      <DetailCell
                        icon={<LocateFixed className="h-3.5 w-3.5" />}
                        label="GPS accuracy"
                        value={`±${Math.round(capture.geo.accuracyMeters)}m`}
                        mono
                      />
                      <DetailCell
                        icon={<Navigation className="h-3.5 w-3.5" />}
                        label="Locality"
                        value={capture.locality}
                      />
                      <DetailCell
                        icon={<Clock className="h-3.5 w-3.5" />}
                        label="Captured (PKT)"
                        value={formatPkClock(capture.capturedAt)}
                        mono
                      />
                    </div>
                    <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-2 text-[11px] font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      Presence Verified — Citizen is on site
                    </p>
                    {outsidePilot && (
                      <p className="flex items-start gap-2 rounded-btn border border-warning/30 bg-warning-tint px-3 py-2.5 text-xs font-semibold leading-5 text-warning">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        Coordinates indicate you are outside Sialkot pilot
                        boundaries. This report will be audited before dispatch.
                      </p>
                    )}
                    <div className="overflow-hidden rounded-btn border border-white/15">
                      <iframe
                        title="Capture location on map"
                        src={osmEmbedUrl(
                          capture.geo.latitude,
                          capture.geo.longitude
                        )}
                        className="h-28 w-full sm:h-36"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 px-4 pb-6 pt-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={retake}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-white/30 px-6 py-3 text-sm font-bold text-white transition-colors hover:border-white/60 hover:bg-white/10"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={confirm}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(5,150,105,0.4)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700 active:translate-y-0 active:scale-[0.98]"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Proceed with this Photo
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : gpsStatus === "denied" ? (
              <div className="relative flex flex-1 items-center justify-center p-4">
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="w-full max-w-md shadow-2xl">{gpsDeniedCard}</div>
              </div>
            ) : cameraStatus === "error" ? (
              <div className="relative flex flex-1 items-center justify-center p-4">
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="w-full max-w-md shadow-2xl">{cameraErrorCard}</div>
              </div>
            ) : cameraLive || cameraStarting ? (
              <div
                ref={viewfinderRef}
                className="relative min-h-0 flex-1 overflow-hidden bg-black"
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                    cameraLive ? "opacity-100" : "opacity-0"
                  }`}
                />
                {cameraStarting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-xs font-bold">Starting camera…</p>
                  </div>
                )}
                {flash && (
                  <div className="animate-shutter-flash absolute inset-0 z-20 bg-white" />
                )}

                {/* Header strip — GPS pill left, clock + close right. */}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-4">
                  {accuracyPill}
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-full bg-black/60 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-md">
                      {clock} PKT
                    </span>
                    <button
                      type="button"
                      onClick={closeOverlay}
                      aria-label="Close camera"
                      className="rounded-full bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/80"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Top-right camera toolbar — torch (when supported) + flip. */}
                <div className="absolute right-3 top-16 flex flex-col gap-2">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={() => void toggleTorch()}
                      aria-pressed={torchOn}
                      aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                      className={`rounded-full bg-black/60 p-2.5 backdrop-blur-md transition-colors hover:bg-black/80 ${
                        torchOn ? "text-amber-300" : "text-white"
                      }`}
                    >
                      <Zap className={`h-5 w-5 ${torchOn ? "fill-amber-300" : ""}`} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={flipCamera}
                    disabled={cameraStarting}
                    aria-label="Flip camera"
                    className="rounded-full bg-black/60 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-black/80 disabled:opacity-50"
                  >
                    <SwitchCamera className="h-5 w-5" />
                  </button>
                </div>

                {/* Centered focus reticle — four corner brackets. */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-white/50" />
                  <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-white/50" />
                  <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-white/50" />
                  <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-white/50" />
                </div>

                {/* Bottom telemetry strip + shutter. */}
                <div className="absolute inset-x-0 bottom-0 space-y-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-7 pt-14">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="rounded-full bg-black/60 px-3 py-1.5 font-mono text-xs font-bold text-white backdrop-blur-md">
                      Lat: {(geo?.latitude ?? 0).toFixed(6)} • Lng:{" "}
                      {(geo?.longitude ?? 0).toFixed(6)}
                    </span>
                    <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
                      📍 {locality ?? "Locating…"}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void handleShutter()}
                      disabled={!cameraLive || !geo}
                      aria-label="Capture photo"
                      className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-black/25 shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="h-16 w-16 rounded-full bg-emerald-500 transition-all hover:bg-emerald-400 active:scale-90" />
                    </button>
                  </div>
                </div>
              </div>
            ) : gpsStatus === "requesting" ? (
              <div className="relative flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-white">
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full bg-white/10 p-2 backdrop-blur-md transition-colors hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="text-sm font-bold">Acquiring GPS lock…</p>
                <p className="max-w-xs text-xs leading-5 text-white/70">
                  Allow location access when your browser prompts — the fix must
                  be live, cached coordinates are rejected.
                </p>
              </div>
            ) : (
              /* GPS locked but the camera has not started (fallback path). */
              <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
                {accuracyPill}
                <button
                  type="button"
                  onClick={() => void openCamera(facing)}
                  className="flex items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary-dark"
                >
                  <Camera className="h-4 w-4" />
                  Open Camera
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
