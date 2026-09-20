"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, MoveHorizontal, Waves } from "lucide-react";

/* ----------------------------------------------------------------------------
 * Proof-of-Resolution showcase — an interactive Before / After reveal built
 * around a river-cleanup story. The "photos" are hand-drawn SVG scenes of the
 * SAME riverbank vantage point (identical skyline), 28 hours apart: choked
 * with solid waste, then restored. Drag the handle (or use arrow keys) to
 * wipe between them.
 * -------------------------------------------------------------------------- */

const HORIZON = 260;

/* Shared skyline so both scenes read as one location. */
const SKYLINE_D =
  "M0 260 L0 196 L58 196 L58 172 L108 172 L108 208 L150 208 L150 150 L188 150 L188 196 L236 196 L236 182 L246 182 L246 144 L250 138 L254 144 L254 182 L263 182 A32 32 0 0 1 327 182 L336 182 L336 144 L340 138 L344 144 L344 182 L354 182 L354 196 L400 196 L400 166 L452 166 L452 196 L462 196 L462 118 L488 88 L514 118 L514 196 L556 196 L556 176 L620 176 L620 196 L648 196 L648 152 L700 152 L700 196 L742 196 L742 182 L800 182 L800 260 Z";

const DOME_D = "M263 182 A32 32 0 0 1 327 182 Z";

const WINDOWS: Array<[number, number, number, number]> = [
  [18, 204, 14, 10], [34, 204, 14, 10], [18, 222, 14, 10], [34, 222, 14, 10],
  [66, 180, 12, 9], [84, 180, 12, 9], [66, 196, 12, 9],
  [160, 158, 10, 8], [174, 158, 10, 8], [160, 172, 10, 8],
  [268, 192, 10, 8], [284, 192, 10, 8], [300, 192, 10, 8], [316, 192, 10, 8],
  [410, 172, 12, 9], [426, 172, 12, 9], [410, 186, 12, 9],
  [472, 130, 10, 9], [494, 130, 10, 9],
  [566, 184, 10, 8], [582, 184, 10, 8],
  [658, 160, 10, 8], [672, 160, 10, 8], [658, 174, 10, 8],
  [752, 190, 12, 9], [768, 190, 12, 9],
];

function Skyline({
  wall,
  dome,
  window: win,
  haze,
}: {
  wall: string;
  dome: string;
  window: string;
  haze?: string;
}) {
  return (
    <g>
      <path d={SKYLINE_D} fill={wall} />
      <path d={DOME_D} fill={dome} />
      {/* minaret finials */}
      <rect x={249} y={132} width={2} height={8} fill={dome} />
      <rect x={339} y={132} width={2} height={8} fill={dome} />
      {/* clock-tower face */}
      <circle cx={488} cy={152} r={8} fill={win} opacity={0.9} />
      {WINDOWS.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={win} />
      ))}
      {haze && <rect x={0} y={100} width={800} height={HORIZON - 100} fill={haze} />}
    </g>
  );
}

/* ------------------------------- BEFORE scene ----------------------------- */

function BeforeScene() {
  return (
    <svg
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      role="img"
      aria-label="Before: Palkhu Nallah choked with plastic waste and debris"
    >
      <defs>
        <linearGradient id="rc-b-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b0a48c" />
          <stop offset="1" stopColor="#8f8672" />
        </linearGradient>
        <linearGradient id="rc-b-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e5b3d" />
          <stop offset="1" stopColor="#463a25" />
        </linearGradient>
      </defs>

      <rect width="800" height={HORIZON} fill="url(#rc-b-sky)" />
      <Skyline wall="#6d675c" dome="#5c5a4e" window="#57534a" haze="#9c9074" />
      <rect x="0" y={HORIZON} width="800" height={450 - HORIZON} fill="url(#rc-b-water)" />

      {/* dull skyline reflection */}
      <rect x="0" y={HORIZON} width="800" height="26" fill="#7a6a4c" opacity="0.35" />
      {/* murky surface streaks */}
      <g stroke="#3c3120" strokeWidth="3" fill="none" opacity="0.55" strokeLinecap="round">
        <path d="M80 320 q40 10 90 2" />
        <path d="M560 350 q50 12 110 4" />
        <path d="M180 390 q45 10 100 3" />
      </g>

      {/* stink squiggles */}
      <g
        transform="translate(-115 4)"
        stroke="#b6a988"
        strokeWidth="2.5"
        fill="none"
        opacity="0.55"
        strokeDasharray="7 7"
        strokeLinecap="round"
      >
        <path d="M330 284 q11 -9 22 0 q11 9 22 0" />
        <path d="M400 268 q11 -9 22 0 q11 9 22 0" />
        <path d="M480 284 q11 -9 22 0 q11 9 22 0" />
      </g>
      {/* flies */}
      <g fill="#2e2a22" transform="translate(-115 4)">
        <circle cx="336" cy="300" r="2" />
        <circle cx="356" cy="290" r="1.6" />
        <circle cx="472" cy="296" r="2" />
        <circle cx="492" cy="286" r="1.5" />
        <circle cx="520" cy="300" r="1.8" />
      </g>

      {/* floating waste raft — kept left of centre so the default 50/50
          reveal shows the pollution immediately */}
      <g transform="translate(-115 4)">
        {/* tyre */}
        <circle cx="330" cy="318" r="25" fill="#26262b" />
        <circle cx="330" cy="318" r="12" fill="#4a3c26" />
        <circle cx="330" cy="318" r="25" fill="none" stroke="#111114" strokeWidth="3" strokeDasharray="4 5" />
        {/* bottle */}
        <g transform="rotate(-22 396 302)">
          <rect x="390" y="284" width="13" height="36" rx="5.5" fill="#cfd8c2" opacity="0.95" />
          <rect x="393.5" y="277" width="6" height="8" fill="#9fae87" />
          <rect x="392.5" y="273" width="8" height="5" rx="1.5" fill="#6f7f57" />
        </g>
        {/* plastic bag */}
        <path
          d="M446 322 q-8 -14 6 -18 q16 -6 24 4 q12 2 8 12 q10 8 -4 12 q-18 8 -28 0 q-12 -2 -6 -10 Z"
          fill="#ded9ca"
          opacity="0.85"
        />
        {/* cup */}
        <g transform="rotate(12 506 312)">
          <path d="M498 302 L514 302 L511 322 L501 322 Z" fill="#e6e1d2" />
          <rect x="497" y="299" width="18" height="4" rx="1.5" fill="#c9c2ae" />
        </g>
        {/* rusted drum */}
        <g transform="rotate(-6 566 344)">
          <rect x="548" y="322" width="36" height="42" rx="4" fill="#4d5648" />
          <rect x="548" y="332" width="36" height="4" fill="#3c4439" />
          <rect x="548" y="350" width="36" height="4" fill="#3c4439" />
          <rect x="556" y="326" width="7" height="10" fill="#6b4a35" opacity="0.8" />
        </g>
        {/* sticks */}
        <g stroke="#4a3a26" strokeWidth="3.5" strokeLinecap="round">
          <path d="M282 342 q26 -10 58 -2" />
          <path d="M300 350 l18 -14" strokeWidth="2.5" />
        </g>
      </g>

      {/* littered bank */}
      <rect x="0" y="428" width="800" height="22" fill="#655a44" />
      <g>
        <rect x="120" y="432" width="14" height="5" rx="2" fill="#c9c2ae" transform="rotate(-8 127 434)" />
        <rect x="210" y="438" width="10" height="4" rx="2" fill="#9d5f48" transform="rotate(14 215 440)" />
        <rect x="620" y="433" width="12" height="5" rx="2" fill="#b8b09a" transform="rotate(-14 626 435)" />
        <circle cx="700" cy="440" r="3" fill="#8d4f3d" />
        <path d="M60 440 q30 -9 62 2" stroke="#453624" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* -------------------------------- AFTER scene ----------------------------- */

function AfterScene() {
  return (
    <svg
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      role="img"
      aria-label="After: the same waterway restored — clean, flowing and green"
    >
      <defs>
        <linearGradient id="rc-a-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe4f4" />
          <stop offset="1" stopColor="#eaf7fb" />
        </linearGradient>
        <linearGradient id="rc-a-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ccfd3" />
          <stop offset="1" stopColor="#2c8d9a" />
        </linearGradient>
        <radialGradient id="rc-a-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffecb0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffecb0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height={HORIZON} fill="url(#rc-a-sky)" />
      <circle cx="648" cy="88" r="64" fill="url(#rc-a-sun)" />
      <circle cx="648" cy="88" r="26" fill="#ffdf8e" />
      {/* clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="150" cy="84" rx="48" ry="14" />
        <ellipse cx="188" cy="74" rx="30" ry="11" />
        <ellipse cx="420" cy="58" rx="40" ry="12" />
        <ellipse cx="450" cy="50" rx="24" ry="9" />
      </g>
      {/* birds */}
      <g stroke="#3f6577" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M232 110 q8 -10 16 0" />
        <path d="M254 96 q8 -10 16 0" />
        <path d="M280 114 q8 -10 16 0" />
      </g>

      <Skyline wall="#a3b8c1" dome="#6faf9c" window="#8ba2ab" />

      <rect x="0" y={HORIZON} width="800" height={450 - HORIZON} fill="url(#rc-a-water)" />
      <rect x="0" y={HORIZON} width="800" height="4" fill="#ffffff" opacity="0.35" />
      {/* bright reflection of sky */}
      <rect x="0" y={HORIZON} width="800" height="22" fill="#bfe9ec" opacity="0.4" />

      {/* ripples */}
      <g stroke="#ffffff" fill="none" strokeLinecap="round">
        <path d="M70 300 q34 9 70 1" strokeWidth="2.5" opacity="0.45" />
        <path d="M250 330 q40 10 84 2" strokeWidth="3" opacity="0.35" />
        <path d="M600 315 q36 9 72 1" strokeWidth="2.5" opacity="0.45" />
        <path d="M140 380 q46 11 96 2" strokeWidth="3" opacity="0.28" />
        <path d="M470 402 q44 11 92 2" strokeWidth="3" opacity="0.28" />
      </g>
      {/* sparkles */}
      <g fill="#eafcff" opacity="0.9">
        <path d="M330 292 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
        <path d="M560 348 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 Z" />
      </g>

      {/* jumping fish */}
      <g transform="rotate(-14 505 306)">
        <path d="M486 306 q19 -15 38 0 q-19 15 -38 0 Z" fill="#f6a04e" />
        <path d="M524 306 l13 -9 v18 Z" fill="#ef8b3c" />
        <circle cx="496" cy="304" r="1.8" fill="#22303a" />
      </g>
      <path d="M492 330 q14 -12 26 -1" stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.6" strokeLinecap="round" />

      {/* riverbank greenery */}
      <rect x="0" y="430" width="800" height="20" fill="#7db469" />
      <path d="M0 430 Q200 422 400 430 T800 430 V450 H0 Z" fill="#8cbd74" />
      {/* tree */}
      <g>
        <path d="M96 434 c3 -38 1 -58 -4 -76" stroke="#6f4f36" strokeWidth="8" fill="none" strokeLinecap="round" />
        <circle cx="90" cy="330" r="32" fill="#63a55e" />
        <circle cx="62" cy="350" r="22" fill="#579754" />
        <circle cx="118" cy="348" r="22" fill="#579754" />
      </g>
      {/* reeds */}
      <g stroke="#4d8f5b" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M640 432 q2 -22 8 -30" />
        <path d="M654 432 q0 -18 -6 -26" />
        <path d="M740 434 q3 -20 10 -26" />
      </g>
      {/* lotus */}
      <g>
        <ellipse cx="700" cy="412" rx="27" ry="7" fill="#57a86e" />
        <path d="M700 376 q11 18 0 36 q-11 -18 0 -36 Z" fill="#f3aab9" />
        <path d="M686 384 q14 12 12 30 q-16 -8 -12 -30 Z" fill="#ee9cb0" />
        <path d="M714 384 q-14 12 -12 30 q16 -8 12 -30 Z" fill="#ee9cb0" />
        <circle cx="700" cy="394" r="3.4" fill="#d4a24e" />
      </g>
      {/* wildflowers */}
      <g>
        <circle cx="150" cy="438" r="3.5" fill="#f2c94c" />
        <circle cx="205" cy="443" r="3" fill="#ef7d8e" />
        <circle cx="255" cy="439" r="3.5" fill="#f2c94c" />
        <circle cx="330" cy="444" r="3" fill="#ef7d8e" />
      </g>
    </svg>
  );
}

/* ------------------------------ Section shell ----------------------------- */

export default function RiverCleanupCompare() {
  const [pos, setPos] = useState(50);
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);

  /* One gentle reveal nudge so visitors discover the slider. */
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        if (touchedRef.current) return;
        const t = Math.min(1, (now - start) / 1600);
        setPos(50 + Math.sin(t * Math.PI) * 20);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 700);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const update = (value: number) => {
    touchedRef.current = true;
    setTouched(true);
    setPos(value);
  };

  return (
    <section className="py-20" aria-labelledby="before-after-heading">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
            <Waves className="h-3.5 w-3.5" />
            Proof of Resolution
            <span className="urdu font-semibold text-emerald-700/80">ثبوتِ حل</span>
          </span>
          <h2
            id="before-after-heading"
            className="font-heading mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Same riverbank. 28 hours apart.
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            One citizen report put MCS Sialkot&apos;s cleanup crew on Palkhu
            Nallah. Drag the handle — everything on the left is what{" "}
            <span className="font-semibold text-slate-800">
              46 endorsements
            </span>{" "}
            erased.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
            {/* Reveal slider */}
            <div className="relative aspect-[16/9] touch-none select-none overflow-hidden rounded-2xl focus-within:ring-4 focus-within:ring-emerald-600/25">
              <div className="absolute inset-0">
                <AfterScene />
              </div>
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
              >
                <BeforeScene />
              </div>

              {/* Tags */}
              <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
                Before — Choked with Waste
              </span>
              <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-emerald-600/90 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                After — Flowing Free
              </span>

              {/* Divider + handle */}
              <div
                className="pointer-events-none absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.35)]"
                style={{ left: `${pos}%` }}
              />
              <div
                className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-black/10"
                style={{ left: `${pos}%` }}
              >
                <MoveHorizontal className="h-5 w-5 text-slate-700" />
              </div>

              {/* Interaction surface — click anywhere to jump, drag to wipe */}
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={pos}
                onChange={(e) => update(Number(e.target.value))}
                aria-label="Reveal before and after — drag or use arrow keys"
                className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
              />

              {/* Hint */}
              <span
                className={`pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm transition-opacity duration-300 ${
                  touched ? "opacity-0" : "opacity-100"
                }`}
              >
                <MoveHorizontal className="h-3.5 w-3.5" />
                Drag to compare
              </span>
            </div>

            {/* Caption strip */}
            <div className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium leading-6 text-slate-700">
                Reported as a choked outfall on Palkhu Nallah — cleared,
                desilted and flowing free in{" "}
                <span className="font-bold text-emerald-700">28 hours</span> by{" "}
                <span className="font-bold text-emerald-700">MCS Sialkot</span>{" "}
                after{" "}
                <span className="font-bold text-emerald-700">
                  46 citizen endorsements
                </span>
                .
              </p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Proof of Resolution Verified
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
