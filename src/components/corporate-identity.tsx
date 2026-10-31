import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";

/**
 * Corporate identity layer for the footer: the operating entity's registration
 * details, and a viewer for its New Mexico Certificate of Organization.
 *
 * The certificate has no static URL. It is fetched from /api/legal/certificate
 * (same-origin fetch only), decoded to a bitmap and painted onto a <canvas> with
 * a watermark burned into the pixels, then covered by an SVG watermark grid.
 * Right-click, drag, copy and print are blocked inside the viewer. These are
 * deterrents: anything shown on a screen can still be photographed or captured.
 */
export const COMPANY = {
  entity: "Saif Tech Global LLC",
  jurisdiction: "State of New Mexico, USA",
  registration: "0008128993",
  type: "Domestic Limited Liability Company",
  formed: "September 10, 2026",
  website: "https://www.saiftechglobal.com",
  websiteLabel: "www.saiftechglobal.com",
  email: "saif@saifglobal16.info",
  registry: "https://www.sos.nm.gov/",
};

const WATERMARK = "SG16IDENTIFIER.COM · VIEW ONLY · NOT FOR REPRODUCTION";

// Kept for the page's lifetime so reopening the viewer does not refetch.
let certificateBitmap: Promise<ImageBitmap> | null = null;

function loadCertificate() {
  certificateBitmap ??= fetch("/api/legal/certificate", { credentials: "same-origin", cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`Certificate request failed (${res.status})`);
      return res.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .catch((error: unknown) => {
      certificateBitmap = null;
      throw error;
    });
  return certificateBitmap;
}

function paintCertificate(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(bitmap, 0, 0);

  // Diagonal watermark burned into the pixels, so a canvas export carries it too.
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `600 ${Math.round(canvas.width / 38)}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = "rgba(201, 0, 43, 0.13)";
  ctx.textAlign = "center";
  const rowHeight = canvas.width / 7;
  const colWidth = canvas.width * 0.75;
  for (let row = 0, y = -canvas.height; y <= canvas.height; row++, y += rowHeight) {
    for (let x = -canvas.width; x <= canvas.width; x += colWidth) {
      ctx.fillText(WATERMARK, x + (row % 2) * (colWidth / 2), y);
    }
  }
  ctx.restore();
}

const block = (event: SyntheticEvent) => event.preventDefault();

export function CertificateButton({ className = "" }: { className?: string }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const show = () => {
    dialogRef.current?.showModal();
    setStatus("loading");
    setOpen(true);
  };
  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadCertificate()
      .then((bitmap) => {
        if (cancelled || !canvasRef.current) return;
        paintCertificate(canvasRef.current, bitmap);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onClose = () => {
    setOpen(false);
    setStatus("idle");
    // Drop the painted pixels from the DOM while the viewer is closed.
    if (canvasRef.current) canvasRef.current.width = 0;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p" || key === "c")) event.preventDefault();
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={`group inline-flex items-center gap-2.5 rounded-full border border-brand-800 bg-brand-500/5 px-4 py-2 text-[12.5px] font-semibold text-brand-400 shadow-[0_0_18px_-8px_var(--glow-red-strong)] transition-colors hover:border-brand-500 hover:bg-brand-500/10 hover:text-paper-50 ${className}`}
      >
        <IconShieldCheck className="h-4 w-4" />
        Certificate of Organization · Verified
      </button>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={(event) => event.target === event.currentTarget && close()}
        onKeyDown={onKeyDown}
        aria-labelledby="certificate-title"
        className="m-auto w-[min(920px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-sm border border-brand-800 bg-ink-950 p-0 text-paper-50 shadow-[0_0_80px_-20px_var(--glow-red-strong)] backdrop:bg-black/85 backdrop:backdrop-blur-sm print:hidden"
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-brand-700/60 bg-ink-900 px-5 py-4">
            <div>
              <p className="rule-label text-brand-400">Corporate identity · official record</p>
              <h2 id="certificate-title" className="mt-1.5 font-display text-lg font-semibold text-paper-50">
                Certificate of Organization — {COMPANY.entity}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close certificate"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-ink-600 text-mist-400 transition-colors hover:border-brand-500 hover:text-paper-50"
            >
              <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          </header>

          <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_260px]">
            {/* Protected runtime container: no image URL in the DOM, no pointer or selection on the pixels. */}
            <div
              onContextMenu={block}
              onDragStart={block}
              onCopy={block}
              className="relative select-none bg-ink-900 p-4 [-webkit-touch-callout:none] [-webkit-user-select:none]"
            >
              <div className="relative mx-auto aspect-[1545/2000] w-full max-w-[520px] overflow-hidden rounded-sm border border-ink-600 bg-ink-800">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`New Mexico Certificate of Organization for ${COMPANY.entity}, registration ${COMPANY.registration}, effective ${COMPANY.formed}`}
                  className="pointer-events-none block h-full w-full select-none"
                />
                <WatermarkGrid />
                {status !== "ready" && (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    {status === "error" ? (
                      <p className="text-[13px] text-mist-400">Certificate temporarily unavailable. Close and try again.</p>
                    ) : (
                      <div className="h-full w-full animate-pulse rounded-sm bg-ink-700/60" aria-label="Loading certificate" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <aside className="border-t border-brand-700/40 bg-ink-950 p-5 md:border-l md:border-t-0">
              <dl className="space-y-3.5 text-[13px]">
                <Fact label="Entity" value={COMPANY.entity} />
                <Fact label="Type" value={COMPANY.type} />
                <Fact label="Jurisdiction" value={COMPANY.jurisdiction} />
                <Fact label="Registration no." value={COMPANY.registration} mono />
                <Fact label="Formed" value={COMPANY.formed} />
              </dl>
              <div className="dash-accent mt-5 rounded-sm bg-ink-900/80 p-3.5 text-[12px] leading-relaxed text-mist-400">
                Evidence before conclusion: don’t take this image on trust. Search registration{" "}
                <span className="font-mono text-paper-50">{COMPANY.registration}</span> at the{" "}
                <a href={COMPANY.registry} target="_blank" rel="noopener noreferrer" className="text-brand-400 underline-offset-2 hover:underline">
                  New Mexico Secretary of State
                </a>{" "}
                to confirm it independently.
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-mist-600">
                Shown for identification only. Reproduction or redistribution is not permitted.
              </p>
            </aside>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Contact column for the footer grid. */
export function CompanyContact() {
  const item = "flex items-start gap-3 text-sm text-mist-400";
  return (
    <div>
      <h3 className="rule-label text-paper-50">Contact</h3>
      <span className="mt-3 block h-px w-8 bg-brand-500/70" />
      <ul className="mt-4 space-y-3.5">
        <li className={item}>
          <IconMail className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          <a href={`mailto:${COMPANY.email}`} className="break-all transition-colors hover:text-brand-400">
            {COMPANY.email}
          </a>
        </li>
        <li className={item}>
          <IconGlobe className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          <a href={COMPANY.website} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-brand-400">
            {COMPANY.websiteLabel} <span aria-hidden className="text-brand-500">↗</span>
          </a>
        </li>
        <li className={item}>
          <IconBuilding className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          <span>
            <span className="block text-paper-50">{COMPANY.entity}</span>
            <span className="mt-1 block text-xs leading-relaxed text-mist-500">
              Reg. No. <span className="font-mono text-mist-300">{COMPANY.registration}</span>
              <br />
              {COMPANY.jurisdiction}
              <br />
              Formed {COMPANY.formed}
            </span>
          </span>
        </li>
      </ul>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="rule-label text-mist-500">{label}</dt>
      <dd className={`mt-1 text-paper-50 ${mono ? "font-mono tracking-wide" : ""}`}>{value}</dd>
    </div>
  );
}

/** Transparent SVG watermark grid laid over the certificate; never receives pointer events. */
function WatermarkGrid() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full select-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="cert-watermark" width="190" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <path d="M0 0H190M0 0V120" stroke="rgb(255 23 68 / 0.10)" strokeWidth="1" />
          <text x="10" y="64" fill="rgb(255 23 68 / 0.16)" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="600" letterSpacing="2">
            SG16 · VIEW ONLY
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cert-watermark)" />
    </svg>
  );
}

function IconShieldCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12.2 2.2 2.2 4.3-4.6" />
    </svg>
  );
}

function IconMail({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </svg>
  );
}

function IconGlobe({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

function IconBuilding({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20" />
      <path d="M8 7h4M8 11h4M8 15h4" />
    </svg>
  );
}
