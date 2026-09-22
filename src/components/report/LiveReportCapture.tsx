"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  X,
} from "lucide-react";
import type { LiveGeoLock } from "@/types/report";
import { isOutsidePilotDistrict } from "@/lib/pilotBoundary";

/* Proof-of-Presence capture flow: a live GPS fix gates the camera, the
   viewfinder overlays the locked telemetry, and the shutter burns a
   verification badge into the frame before it can be attached. Gallery /
   file-picker uploads are not offered — the only paths in are the WebRTC
   stream or the mobile capture="environment" input, both of which capture
   live sensor frames. */

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0, // never reuse a cached fix — the lock must be live
};

/** Above this the fix is usable but flagged: the citizen sees an amber
    advisory instead of a hard block (indoor basements, dense souks). */
const GPS_ACCURACY_LIMIT_M = 50;

type GpsStatus = "idle" | "requesting" | "locked" | "inaccurate" | "denied";
type CameraStatus = "off" | "starting" | "live" | "error";

interface VerifiedCapture {
  file: File;
  previewUrl: string;
  geo: LiveGeoLock;
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

/** Burn the verification badge into the bottom-right corner of the frame. */
function stampVerificationBadge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  geo: LiveGeoLock
): void {
  const pad = Math.round(height * 0.028);
  const fontSize = Math.max(12, Math.round(height * 0.024));
  const lines = [
    "صدائے عوام • Sada-e-Awam Verified Submission",
    `GPS: ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} (±${Math.round(geo.accuracyMeters)}m)`,
    `Timestamp: ${new Date().toISOString()}`,
  ];
  ctx.font = `${fontSize}px "Noto Sans Arabic", ui-sans-serif, system-ui, sans-serif`;
  const widest = Math.max(
    ...lines.map((line) => ctx.measureText(line).width)
  );
  const boxW = widest + pad * 2;
  const boxH = fontSize * 1.5 * lines.length + pad * 1.4;
  const x = width - boxW - pad;
  const y = height - boxH - pad;

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, boxW, boxH, fontSize * 0.7);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, boxW, boxH);
  }
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, x + pad, y + pad * 0.7 + index * fontSize * 1.5);
  });
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

export default function LiveReportCapture({
  storedFile,
  storedGeo,
  storedCapturedAt,
  onConfirm,
  onRemove,
}: LiveReportCaptureProps) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [geo, setGeo] = useState<LiveGeoLock | null>(null);
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

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

  /* Leaving the step (or the page) mid-viewfinder must release the sensor. */
  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraStatus("live");
    } catch (error) {
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
    }
  }, []);

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

  /* Live PKT clock for the HUD horizon bar, ticking only while open. */
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
    setGpsDeniedReason(null);
    setCameraError(null);
    setCameraStatus("off");
    setGpsStatus("requesting");
    if (!("geolocation" in navigator)) {
      setGpsStatus("denied");
      setGpsDeniedReason("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
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
        void openCamera();
      },
      (error) => {
        setGpsStatus("denied");
        setGpsDeniedReason(
          error.code === error.PERMISSION_DENIED
            ? "permission"
            : "unavailable"
        );
      },
      GPS_OPTIONS
    );
  }, [openCamera]);

  const handleShutter = () => {
    const video = videoRef.current;
    const lock = geo;
    if (!video || !lock || cameraStatus !== "live" || video.videoWidth === 0)
      return;

    /* Cover-crop the sensor frame to the viewfinder box so the evidence
       image matches exactly what the citizen framed on screen. */
    const box = viewfinderRef.current?.getBoundingClientRect();
    const targetAspect =
      box && box.height > 0 ? box.width / box.height : 4 / 3;
    const sensorAspect = video.videoWidth / video.videoHeight;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sensorAspect > targetAspect) {
      sw = sh * targetAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = sw / targetAspect;
      sy = (video.videoHeight - sh) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraStatus("error");
      setCameraError("failed");
      return;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    stampVerificationBadge(ctx, canvas.width, canvas.height, lock);

    const capturedAt = new Date().toISOString();
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
          capturedAt,
        });
      },
      "image/jpeg",
      0.9
    );
  };

  /* Mobile fallback: capture="environment" launches the rear camera in the
     OS camera app — no gallery is reachable from that picker. */
  const handleNativeCapture = async (file: File) => {
    const lock = geo;
    if (!lock) return;
    const capturedAt = new Date().toISOString();
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
      stampVerificationBadge(ctx, canvas.width, canvas.height, lock);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setCapture({
            file: new File([blob], `sada-e-awam-live-${Date.now()}.jpg`, {
              type: "image/jpeg",
            }),
            previewUrl: URL.createObjectURL(blob),
            geo: lock,
            capturedAt,
          });
        },
        "image/jpeg",
        0.9
      );
    } catch {
      /* Decode failed — keep the raw capture; the GPS telemetry is already
         locked and travels with the report either way. */
      setCapture({
        file,
        previewUrl: URL.createObjectURL(file),
        geo: lock,
        capturedAt,
      });
    }
  };

  const retake = () => {
    if (capture) URL.revokeObjectURL(capture.previewUrl);
    setCapture(null);
    onRemove();
    setGeo(null);
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

  /* Just captured, awaiting confirmation — spec's verification card. */
  if (capture) {
    return (
      <div className="space-y-4">
        {header}
        {outsidePilot && (
          <p className="flex items-start gap-2 rounded-btn border border-warning/30 bg-warning-tint px-3 py-2.5 text-xs font-semibold leading-5 text-warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Coordinates indicate you are outside Sialkot pilot boundaries. This
            report will be audited before dispatch.
          </p>
        )}
        <img
          src={capture.previewUrl}
          alt="Live captured incident evidence"
          className="w-full rounded-btn border border-line bg-black object-contain"
        />
        <div className="overflow-hidden rounded-btn border border-line">
          <iframe
            title="Capture location on map"
            src={osmEmbedUrl(capture.geo.latitude, capture.geo.longitude)}
            className="h-40 w-full"
            loading="lazy"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TelemetryChip icon={<MapPin className="h-3.5 w-3.5" />}>
            {formatCoords(capture.geo.latitude, capture.geo.longitude)}
          </TelemetryChip>
          <TelemetryChip icon={<Clock className="h-3.5 w-3.5" />}>
            Captured: Just now (Live)
          </TelemetryChip>
          <TelemetryChip
            tone="verified"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          >
            Presence Verified: Citizen is on site
          </TelemetryChip>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={retake}
            className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-line px-6 py-3 text-sm font-bold text-ink-soft hover:border-ink-muted hover:text-ink"
          >
            <RotateCcw className="h-4 w-4" />
            Retake Photo
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirm &amp; Proceed to Details
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  /* Confirmed earlier (step revisits) — compact verified summary. */
  if (storedFile && storedGeo) {
    return (
      <div className="space-y-3">
        {header}
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
    );
  }

  /* --------------------------- pre-capture states -------------------------- */

  const cameraStarting = cameraStatus === "starting";
  const cameraLive = cameraStatus === "live";

  return (
    <div className="space-y-3">
      {header}

      {gpsStatus === "inaccurate" && !capture && (
        <p className="flex items-start gap-2 rounded-btn border border-warning/30 bg-warning-tint px-3 py-2.5 text-xs font-semibold leading-5 text-warning">
          <LocateFixed className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" />
          Acquiring precision GPS… Please step into an open area for better
          satellite accuracy (Current: ±{Math.round(geo?.accuracyMeters ?? 0)}m).
        </p>
      )}

      {gpsStatus === "denied" ? (
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
      ) : cameraStatus === "error" ? (
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
              onClick={openCamera}
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
      ) : cameraLive || cameraStarting ? (
        <div
          ref={viewfinderRef}
          className="relative aspect-[3/4] overflow-hidden rounded-card-lg border border-line bg-black sm:aspect-[4/3]"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              cameraLive ? "opacity-100" : "opacity-0"
            }`}
          />
          {cameraStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs font-bold">Starting camera…</p>
            </div>
          )}

          {/* Top horizon bar — GPS lock + live PKT clock */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-2.5 text-[11px] font-bold text-white">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              GPS LOCKED (±{Math.round(geo?.accuracyMeters ?? 0)}m)
            </span>
            <span className="font-mono">{clock} PKT</span>
          </div>

          <button
            type="button"
            onClick={stopCamera}
            aria-label="Close camera"
            className="absolute right-2 top-10 rounded-full bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Center framing guide */}
          <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/40 sm:inset-8">
            <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-white/50" />
            <span className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-white/50" />
          </div>

          {/* Bottom overlay — coordinates, ward detection, shutter */}
          <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-4 pt-10">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="rounded-full bg-black/60 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-md">
                Lat: {(geo?.latitude ?? 0).toFixed(6)} • Lng:{" "}
                {(geo?.longitude ?? 0).toFixed(6)}
              </span>
              <span className="rounded-full bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur-md">
                <span className="animate-pulse">
                  Detecting nearest municipal ward…
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleShutter}
              disabled={!cameraLive}
              aria-label="Capture photo"
              className="mx-auto flex h-18 w-18 items-center justify-center rounded-full border-4 border-white bg-emerald-500 shadow-lg transition-all hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="h-11 w-11 rounded-full bg-white/95" />
            </button>
          </div>
        </div>
      ) : gpsStatus === "locked" || gpsStatus === "inaccurate" ? (
        <div className="space-y-2 rounded-card-lg border border-line bg-canvas p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            GPS LOCKED (±{Math.round(geo?.accuracyMeters ?? 0)}m)
          </p>
          <button
            type="button"
            onClick={() => void openCamera()}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
          >
            <Camera className="h-4 w-4" />
            Open Camera
          </button>
        </div>
      ) : gpsStatus === "requesting" ? (
        <div className="flex items-center gap-3 rounded-card-lg border border-line bg-canvas p-4">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-bold text-ink">Acquiring GPS lock…</p>
            <p className="text-xs text-ink-soft">
              Allow location access when your browser prompts — the fix must be
              live, cached coordinates are rejected.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-card-lg border-2 border-dashed border-line bg-canvas p-4 text-center">
          <p className="text-xs leading-5 text-ink-soft">
            A stamped GPS fix + live shutter proof is required before this
            report can move to review.
          </p>
          <button
            type="button"
            onClick={startFlow}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
          >
            <Camera className="h-4 w-4" />
            Snap Live Photo
            <span className="urdu font-normal">براہِ راست تصویر لیں</span>
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
    </div>
  );
}
