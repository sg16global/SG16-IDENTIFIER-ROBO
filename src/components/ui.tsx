import { useLocation } from "react-router";
import { Img } from "@/components/img";
import { Link } from "@/components/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { COMPANY, CertificateButton, CompanyContact } from "@/components/corporate-identity";

/* ------------------------------ motion helpers ----------------------------- */

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  // Without IntersectionObserver there is nothing to wait for: show at once.
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article" | "tr";
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const Component = Tag as unknown as "div";
  return (
    <Component
      ref={ref}
      className={`${shown ? "reveal-in" : "reveal"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Component>
  );
}

export function CountUp({
  to,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1400,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}) {
  const { ref, shown } = useReveal<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const start = performance.now();
    // Respect reduced-motion: jump straight to the final value on the first frame.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const p = reduced ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(to * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, to, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* --------------------------------- icons ---------------------------------- */

type IconProps = { className?: string; strokeWidth?: number };

const base = (className?: string) => `shrink-0 ${className ?? "h-5 w-5"}`;

export function IconSeal({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M12 2.5 20 6v6.2c0 4.5-3.2 7.9-8 9.3-4.8-1.4-8-4.8-8-9.3V6l8-3.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="m8.4 12.2 2.5 2.5 4.7-5" stroke="currentColor" strokeWidth={strokeWidth + 0.35} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBarcode({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M3 7V4.8A1.8 1.8 0 0 1 4.8 3H7M17 3h2.2A1.8 1.8 0 0 1 21 4.8V7M21 17v2.2a1.8 1.8 0 0 1-1.8 1.8H17M7 21H4.8A1.8 1.8 0 0 1 3 19.2V17" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M7 8v8M10 8v8M12.6 8v8M15.4 8v8M18 8v8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconNews({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M4 5.5h13v13H5.5A1.5 1.5 0 0 1 4 17V5.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M17 9h3v8a1.5 1.5 0 0 1-3 0V9Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M6.8 8.4h7.4M6.8 11.2h4.2M6.8 13.8h7.4M6.8 16.2h4.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconLink({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.2.2l2.6-2.7a3.7 3.7 0 0 0-5.2-5.2l-1.3 1.3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.2-.2L6 12.7a3.7 3.7 0 0 0 5.2 5.2l1.3-1.3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconFrame({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M3.6 6.2A2.6 2.6 0 0 1 6.2 3.6M17.8 3.6a2.6 2.6 0 0 1 2.6 2.6M20.4 17.8a2.6 2.6 0 0 1-2.6 2.6M6.2 20.4a2.6 2.6 0 0 1-2.6-2.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="1.6" stroke="currentColor" strokeWidth={strokeWidth * 0.7} opacity="0.45" />
      <path d="m5.4 16.4 3.7-4.2 2.6 2.8 2.2-2.4 4.7 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.2" cy="8.6" r="1.5" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function IconDatabase({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <ellipse cx="12" cy="6" rx="7.4" ry="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M4.6 6v6c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3V6M4.6 12v6c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3v-6" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function IconLock({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <rect x="4.6" y="10.2" width="14.8" height="10.2" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M12 14v2.8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconCpu({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="1.6" stroke="currentColor" strokeWidth={strokeWidth} />
      <rect x="10" y="10" width="4" height="4" rx="0.6" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M9.4 3.4v3.2M14.6 3.4v3.2M9.4 17.4v3.2M14.6 17.4v3.2M3.4 9.4h3.2M3.4 14.6h3.2M17.4 9.4h3.2M17.4 14.6h3.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconChart({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M3.6 20.4h16.8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M6.6 20.4v-6.2M11 20.4V7.6M15.4 20.4v-9M19.8 20.4V4.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function IconArrow({ className, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M4.8 12h14M13.4 6.6 18.8 12l-5.4 5.4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M12 3.8 21 19.4H3L12 3.8Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 9.6v4.2M12 16.6h.01" stroke="currentColor" strokeWidth={strokeWidth + 0.4} strokeLinecap="round" />
    </svg>
  );
}

export function IconScale({ className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={base(className)} aria-hidden>
      <path d="M12 4v16M6 20h12M4 9h16M4 9l-2.2 5.2a3 3 0 0 0 4.4 0L4 9ZM20 9l-2.2 5.2a3 3 0 0 0 4.4 0L20 9Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="4" r="1.4" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export const CATEGORY_ICONS = {
  product: IconBarcode,
  claim: IconNews,
  website: IconLink,
  media: IconFrame,
} as const;

/* ------------------------------- primitives -------------------------------- */

export function SectionLabel({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "ok" | "mist" | "warn" | "risk";
}) {
  const color =
    tone === "brand"
      ? "text-brand-400"
      : tone === "warn"
        ? "text-warn-400"
        : tone === "ok"
          ? "text-ok-400"
          : tone === "risk"
            ? "text-risk-400"
            : "text-mist-500";
  return (
    <div className="flex items-center gap-3">
      <span className={`h-px w-8 bg-current ${color}`} />
      <span className={`rule-label ${color}`}>{children}</span>
    </div>
  );
}

export function Panel({
  children,
  className = "",
  style,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
}) {
  return (
    <div
      style={style}
      className={`card-edge relative overflow-hidden rounded-sm ${hover ? "card-hover" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function TonalChip({
  tone,
  children,
  className = "",
}: {
  tone: "brand" | "ok" | "warn" | "risk" | "unknown" | "info" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  const map = {
    brand: "border-brand-700 bg-brand-500/10 text-brand-400",
    ok: "border-ok-400/40 bg-ok-400/10 text-ok-400",
    warn: "border-warn-500/45 bg-warn-500/10 text-warn-400",
    risk: "border-risk-500/45 bg-risk-500/12 text-risk-400",
    unknown: "border-unknown-400/40 bg-unknown-400/10 text-mist-400",
    info: "border-info-400/40 bg-info-400/10 text-info-400",
    neutral: "border-mist-500/25 bg-mist-500/5 text-mist-400",
  } as const;
  return (
    <span className={`rule-label inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 ${map[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function ConfidenceMeter({
  value,
  tone = "ok",
  label = "Confidence",
  note,
}: {
  value: number | null;
  tone?: "brand" | "ok" | "warn" | "risk" | "unknown";
  label?: string;
  note?: string;
}) {
  const pct = value === null ? 0 : Math.round(value * 100);
  const bar = {
    brand: "bg-brand-500",
    ok: "bg-ok-400",
    warn: "bg-warn-500",
    risk: "bg-risk-500",
    unknown: "bg-unknown-400",
  }[tone];
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-4">
        <span className="rule-label text-mist-500">{label}</span>
        <span className="font-mono text-sm tabular-nums text-paper-50">
          {value === null ? "not stated" : `${pct}%`}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-600"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : pct}
        aria-valuetext={value === null ? "not stated" : `${pct}%`}
      >
        <div
          className={`h-full ${bar} transition-[width] duration-1000 ease-out`}
          style={{ width: `${value === null ? 3 : pct}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist-600">
        {note ??
          (value === null
            ? "SG16 abstains rather than inventing a confidence figure when evidence is insufficient."
            : "Calibrated from the weighted findings and the number of retrieved sources — not asserted by the model.")}
      </p>
    </div>
  );
}

export function DataLine({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-600/70 py-2 last:border-0">
      <span className="rule-label text-mist-600">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-sm tabular-nums text-paper-50`}>{value}</span>
    </div>
  );
}

/* --------------------------------- chrome ---------------------------------- */

const NAV = [
  { href: "/identify", label: "Identify" },
  { href: "/tools/news", label: "News" },
  { href: "/tools/websites", label: "Websites" },
  { href: "/tools/products", label: "Products" },
  { href: "/tools/media", label: "Media" },
  { href: "/business", label: "Business" },
  { href: "/blueprint", label: "Blueprint" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-ink-950/92 backdrop-blur-xl transition-colors duration-500 ${
        scrolled ? "border-brand-700" : "border-brand-700/50"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-5 sm:gap-6 sm:px-8">
        <Link href="/" className="group flex shrink-0 items-center" aria-label="SG16 Identifier — home">
          <Img
            src="/assets/logo.png"
            alt="SG16 Identifier — evidence before conclusion"
            width={1986}
            height={792}
            sizes="(min-width: 640px) 120px, 100px"
            preload
            className="h-10 w-auto transition-[filter] duration-300 group-hover:brightness-125 sm:h-12"
          />
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-sm px-3 py-2 text-[13px] font-medium transition-colors ${
                  active ? "text-brand-400" : "text-paper-50 hover:text-brand-400"
                }`}
              >
                {item.label}
                {active && <span className="absolute inset-x-3 -bottom-0.5 h-px bg-brand-500" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link
            href="/admin"
            aria-current={pathname === "/admin" ? "page" : undefined}
            className="hidden rounded-sm border border-brand-700 bg-ink-950 px-3 py-2 text-[12px] text-paper-50 transition-colors hover:border-brand-500 hover:text-brand-400 sm:block"
          >
            Admin
          </Link>
          <Link
            href="/identify"
            className="glow-accent whitespace-nowrap rounded-sm bg-brand-cta px-3 py-2 text-[13px] font-semibold text-white transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-brand-cta-hover sm:px-4"
          >
            Run a check
          </Link>
          <button
            type="button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-sm border border-brand-700 bg-ink-950 text-paper-50 transition-colors hover:border-brand-500 hover:text-brand-400 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        inert={!open}
        className={`overflow-hidden border-t bg-ink-950 transition-[max-height] duration-500 lg:hidden ${
          open ? "max-h-[36rem] border-brand-700/40" : "max-h-0 border-transparent"
        }`}
      >
        <nav aria-label="Mobile" className="mx-auto grid max-w-[1400px] gap-1 px-5 py-4 sm:px-8">
          {[...NAV, { href: "/admin", label: "Admin console" }].map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-sm border px-3 py-3 text-sm transition-colors ${
                  active
                    ? "border-brand-700 bg-brand-500/8 text-brand-400"
                    : "border-transparent text-paper-50 hover:border-brand-700 hover:bg-ink-900 hover:text-brand-400"
                }`}
              >
                {item.label}
                <IconArrow className={`h-4 w-4 ${active ? "text-brand-400" : "text-mist-600"}`} />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const columns: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
    {
      title: "Verification",
      links: [
        { href: "/identify", label: "Universal check" },
        { href: "/tools/news", label: "News & claims" },
        { href: "/tools/websites", label: "Websites & scams" },
        { href: "/tools/products", label: "Products & electronics" },
        { href: "/tools/media", label: "Image & video" },
      ],
    },
    {
      title: "Platform",
      links: [
        { href: "/blueprint", label: "Project blueprint" },
        { href: "/business", label: "Business & API" },
        { href: "/admin", label: "Admin console" },
        { href: "/legal/limitations", label: "What we cannot prove" },
        { href: "/api/health", label: "Service health" },
      ],
    },
    {
      title: "Policies",
      links: [
        { href: "/legal/privacy", label: "Privacy & retention" },
        { href: "/legal/terms", label: "Terms of use" },
        { href: "/legal/limitations", label: "Verification limits" },
        { href: "/legal/corrections", label: "Corrections & appeals" },
        { href: "/legal/disclosure", label: "Commercial disclosure" },
      ],
    },
  ];

  return (
    <footer className="relative mt-16 border-t border-ink-600 bg-ink-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
      <div className="grid-field pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Img
              src="/assets/logo.png"
              alt="SG16 Identifier — evidence before conclusion"
              width={1986}
              height={792}
              sizes="140px"
              className="h-14 w-auto"
            />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-mist-500">
              One platform for investigating authenticity across products, news, websites and
              digital media. Free for the public, funded by disclosed advertising, affiliate
              referrals and business services — never by the outcome of a check.
            </p>
            <p className="mt-5 max-w-sm text-xs leading-relaxed text-mist-600">
              SG16 Identifier is an independent verification tool. It is not affiliated with,
              endorsed by or acting on behalf of any manufacturer, retailer, platform or
              fact-checking organisation named in its reports.
            </p>
            <CertificateButton className="mt-6" />
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="rule-label text-paper-50">{col.title}</h3>
              <span className="mt-3 block h-px w-8 bg-brand-500/70" />
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => {
                  const className = "group inline-flex items-center gap-2 text-sm text-mist-400 transition-colors hover:text-brand-400";
                  const body = (
                    <>
                      <span className="h-px w-0 bg-brand-500 transition-all duration-300 group-hover:w-3" />
                      {link.label}
                    </>
                  );
                  return (
                    <li key={link.href}>
                      {/* API endpoints are not pages: a plain anchor loads them instead of routing in the app. */}
                      {link.href.startsWith("/api/") ? (
                        <a href={link.href} className={className}>{body}</a>
                      ) : (
                        <Link href={link.href} className={className}>{body}</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          <CompanyContact />
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-ink-600 pt-6 text-xs text-mist-600 md:flex-row md:items-center md:justify-between">
          <p className="font-mono">
            © {year} {COMPANY.entity} <span className="text-brand-600">·</span> SG16 Identifier{" "}
            <span className="text-brand-600">·</span> sg16identifier.com <span className="text-brand-600">·</span> v1.0
          </p>
          <p className="max-w-2xl leading-relaxed">
            Affiliate disclosure: some outbound retailer links are commercial. Commissions never
            influence a verification result, and every referral click is logged and attributable.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function ScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div className="h-full bg-gradient-to-r from-brand-600 via-brand-500 to-brand-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
