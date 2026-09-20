"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, MessageCircle, Share2 } from "lucide-react";

/* ----------------------------------------------------------------------------
 * SharePopover — universal share engine for incident cards. On devices with
 * the Web Share API it fires the native OS share sheet; everywhere else it
 * opens a compact popover with Copy Link / WhatsApp / X / Facebook.
 * -------------------------------------------------------------------------- */

/* Brand glyphs (lucide dropped brand marks — minimal inline paths). */
function XGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
    </svg>
  );
}

const ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50";

export default function SharePopover({
  title,
  areaName,
  token,
  onToast,
  className = "",
}: {
  title: string;
  areaName: string;
  token: string;
  onToast?: (message: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Outside click + Escape close the popover. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const shareUrl = () => `${window.location.origin}/track?id=${token}`;
  const shareText = `⚠️ Civic Hazard reported in ${areaName}: "${title}". Track or verify the report on Sada-e-Awam:`;

  /* Web Share API on supporting devices; popover everywhere else. */
  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${title} — Sada-e-Awam Sialkot`,
          text: shareText,
          url: shareUrl(),
        });
        return;
      } catch {
        /* user dismissed the native sheet — fall through to the popover */
      }
    }
    setOpen((prev) => !prev);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
    } catch {
      /* clipboard unavailable — still show feedback via the URL bar hint */
    }
    setCopied(true);
    onToast?.("✓ Link copied to clipboard");
    window.setTimeout(() => setCopied(false), 2000);
  };

  /* Hrefs touch window.location, so build them only on the client while the
     popover is open — never during server rendering. */
  const hrefs = open
    ? (() => {
        const url = shareUrl();
        const encodedUrl = encodeURIComponent(url);
        return {
          whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(
            `${shareText} ${url}`,
          )}`,
          twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            shareText,
          )}&url=${encodedUrl}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        };
      })()
    : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleShare}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-100 active:scale-95 ${className}`}
      >
        <Share2 className="h-4 w-4 text-slate-500" />
        Share
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Share this incident"
          className="animate-in fade-in zoom-in-95 duration-150 absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl"
        >
          <button type="button" role="menuitem" onClick={copyLink} className={ITEM_CLASS}>
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Link2 className="h-4 w-4 text-emerald-600" />
            )}
            {copied ? "Copied!" : "Copy Public Link"}
          </button>
          <a
            role="menuitem"
            href={hrefs?.whatsapp ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={ITEM_CLASS}
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            WhatsApp
          </a>
          <a
            role="menuitem"
            href={hrefs?.twitter ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={ITEM_CLASS}
          >
            <XGlyph className="h-4 w-4 text-slate-900" />
            X / Twitter
          </a>
          <a
            role="menuitem"
            href={hrefs?.facebook ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={ITEM_CLASS}
          >
            <FacebookGlyph className="h-4 w-4 text-[#1877F2]" />
            Facebook
          </a>
        </div>
      )}
    </div>
  );
}
