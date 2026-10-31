import type { VerificationCategory } from "@/lib/types";

/** Verification modules rendered at /tools/:slug. Shared by the page and the Worker (titles for search and link previews). */

export interface ModulePage {
  slug: string;
  category: VerificationCategory;
  eyebrow: string;
  title: string;
  accent: string;
  lede: string;
  checks: Array<{ title: string; body: string }>;
  cannot: string[];
  sources: Array<{ name: string; role: string; status: string }>;
  examples: Array<{ label: string; value: string }>;
  faq: Array<{ q: string; a: string }>;
  related: Array<{ href: string; label: string }>;
}

export const TOOL_PAGES: Record<string, ModulePage> = {
  news: {
    slug: "news",
    category: "claim",
    eyebrow: "Service 02 — News & Claim Identifier",
    title: "Paste the story. Get the evidence.",
    accent: "text-brand-400",
    lede:
      "A claim repeated across a hundred websites is usually one source syndicated a hundred times. This module decomposes what you paste into atomic, checkable claims, retrieves published fact-checks and independent reporting, rates every source it finds, and tells you plainly when it cannot reach a conclusion.",
    checks: [
      { title: "Atomic claim decomposition", body: "Splits a post or article into individual checkable propositions, separating factual assertions from opinion, prediction and quoted speech. A verdict on the whole is meaningless when only one sentence is false." },
      { title: "Published ClaimReview retrieval", body: "Queries the Google Fact Check Tools API for existing reviews by fact-checking organisations, capturing the reviewer, the textual rating and the review date." },
      { title: "Source trust rating", body: "Every retrieved source is classified as official (government, intergovernmental, academic), reputable publisher, mixed/user-generated, or unrated. Repetition across unrated sources is not treated as corroboration." },
      { title: "Framing and language analysis", body: "Detects absolute quantifiers, unnamed authority ('studies show'), suppression narratives, causal overreach, numeric claims without denominators and emotive amplification." },
      { title: "Date and context extraction", body: "Pulls explicit dates, quotations and numbers from the submission so they can be compared against publication dates in the retrieved corpus." },
      { title: "Evidence comparison and abstention", body: "A deterministic scorer weighs supporting and contradicting evidence. Where nothing was retrieved, the result is 'Unable to verify' with a null confidence — never a guess." },
    ],
    cannot: [
      "Prove that a claim is true because no fact-check exists. Absence of a review is not evidence of accuracy.",
      "Verify a claim that is pure opinion, prediction or value judgement — those are flagged as not factually checkable.",
      "Read a paywalled article body it cannot legally retrieve; it works from the metadata and snippets it is permitted to see.",
      "Establish the origin of an image attached to the article — that is the Image & Video Identifier's job.",
    ],
    sources: [
      { name: "Google Fact Check Tools API", role: "Existing ClaimReviews from fact-checking organisations", status: "key-dependent" },
      { name: "Licensed web search", role: "Primary sources, official statements, corroborating reporting", status: "key-dependent" },
      { name: "SG16 framing lexicon", role: "Absolute quantifiers, unnamed authority, suppression narratives", status: "always on" },
      { name: "AI analyst (optional)", role: "Claim typing, evidence comparison, plain-language summary", status: "key-dependent" },
      { name: "Trust-tier classifier", role: "Official / reputable / mixed / unrated labelling of every source", status: "always on" },
    ],
    examples: [
      { label: "Suppressed-cure claim", value: "Doctors confirm that drinking boiled lemon water every morning cures type 2 diabetes within three weeks, but the pharmaceutical industry is suppressing the study." },
      { label: "Absolute legal claim", value: "A new law passed last week means every phone purchased before 2024 will stop working on all networks from January." },
      { label: "Unnamed authority", value: "Studies show that 100% of people who work from home are more productive, and experts agree offices will be illegal by 2030." },
      { label: "Recycled event", value: "BREAKING: this video from last night shows the bridge collapsing. Mainstream media won't show it." },
    ],
    faq: [
      { q: "What ratings can a claim receive?", a: "Supported, contradicted, misleading, disputed, or unable to verify. 'Misleading' means the underlying facts are real but the framing is not — the most common outcome in practice, and the one most tools get wrong." },
      { q: "Do you decide whether a source is trustworthy?", a: "Sources are tiered by domain class and publisher, and every tier assignment appears in the report so you can disagree with it. A tier is a prior, not a verdict: an official domain can still publish an error, and a blog can still be right." },
      { q: "Why is my result 'Unable to verify'?", a: "Because no fact-check matched and either no search provider is configured or nothing relevant was returned. The report lists which providers were unavailable. That is an honest answer, not a failure." },
      { q: "Can I check a claim in another language?", a: "Submit it as-is. The fact-check query sends a language code, so non-English coverage depends on what the indexed fact-checkers have published. The framing lexicon is currently English-first." },
    ],
    related: [
      { href: "/tools/media", label: "Check the image attached to the claim" },
      { href: "/tools/websites", label: "Check the site publishing it" },
      { href: "/legal/limitations", label: "What SG16 cannot prove" },
    ],
  },
  websites: {
    slug: "websites",
    category: "website",
    eyebrow: "Service 03 — Website & Scam Identifier",
    title: "Before you click, before you pay.",
    accent: "text-brand-400",
    lede:
      "Fake shops live for weeks, not years. They register new domains, obtain short-lived certificates, borrow brand names as subdomains, and use the same handful of pressure phrases. This module inspects the infrastructure behind a link and the language around it, then tells you which of those signals are actually present.",
    checks: [
      { title: "SSRF-safe target screening", body: "Only http and https are permitted. Credentials in URLs, bare IPs, loopback, RFC1918, CGNAT, link-local and cloud-metadata ranges are rejected before any connection is attempted." },
      { title: "DNS and email posture", body: "Resolves A/AAAA, reads SOA and NS, checks MX, and reports whether SPF and DMARC are published. A domain with no email authentication is trivially impersonable." },
      { title: "TLS certificate inspection", body: "Reads the certificate actually presented: issuer, subject, validity window, certificate age in days and how many hostnames it covers. Hundreds of SANs usually means shared, low-quality hosting." },
      { title: "Commercial URL reputation", body: "Queries Google Web Risk for MALWARE, SOCIAL_ENGINEERING and UNWANTED_SOFTWARE classifications when a key is configured — and says so when it is not." },
      { title: "Sandboxed page fetch", body: "Follows redirects manually, re-validating every hop, then inspects the landing page for credential forms, irreversible-payment vocabulary, HSTS and server disclosure." },
      { title: "Impersonation and deception detection", body: "Homoglyph folding, punycode detection, trust-word subdomains, hyphen and digit stuffing, and the classic pattern of a brand name used as a subdomain of somebody else's registrable domain." },
      { title: "Message-language lexicon", body: "Eighteen independent scam signals: manufactured urgency, account threats, gift cards and wire transfers, one-time codes, remote-access tools, customs fees, guaranteed returns and counterfeit-grade marketing terms." },
    ],
    cannot: [
      "Tell you a site is safe because it is not on a blocklist. Coverage is incomplete and new domains take time to be classified.",
      "Read WHOIS registration data in this deployment, so domain creation date and registrar are reported as unknown rather than guessed.",
      "Execute JavaScript, so client-side redirect chains and behaviour that only appears in a real browser are not observed.",
      "Prove intent. A cluster of warning signs describes risk; it does not convict a named business.",
    ],
    sources: [
      { name: "Public DNS resolvers", role: "A/AAAA, SOA, NS, MX, TXT, SPF, DMARC, CNAME", status: "always on" },
      { name: "TLS handshake", role: "Certificate issuer, validity, age and SAN count", status: "always on" },
      { name: "Google Web Risk / Safe Browsing", role: "Commercial malicious-URL classification", status: "key-dependent" },
      { name: "SSRF-guarded HTTP probe", role: "Status, redirect chain, headers, forms, payment vocabulary", status: "switch-controlled" },
      { name: "SG16 deception lexicons", role: "URL structure, impersonation and message-language signals", status: "always on" },
    ],
    examples: [
      { label: "Clearance scam shop", value: "https://dyson-outlet-clearance.top/shop/v15-detect-70-off — only 3 left, ends in 2 hours, 100% original guaranteed" },
      { label: "Parcel fee message", value: "DHL: your parcel is held at customs. Pay the $2.99 clearance fee within 24 hours or it will be returned: http://dhl-customs-fee.cc/pay" },
      { label: "Brand subdomain trick", value: "Confirm your account now at https://paypal.secure-verify-login.xyz/authenticate — your account will be suspended otherwise" },
      { label: "Bare IP phishing", value: "Dear customer, unusual sign-in detected. Log in here http://185.220.101.44/verify/index.php to avoid closure" },
    ],
    faq: [
      { q: "Will SG16 visit the link I submit?", a: "Only through the SSRF guard, and only if the outbound-fetch switch is enabled. Private and internal address ranges are rejected, redirects are re-validated hop by hop, the response is size-capped, and the retrieved HTML is treated as untrusted data rather than instructions." },
      { q: "What makes a domain 'suspicious' versus 'high risk'?", a: "Suspicious means several warning signs accumulated without a definitive failure. High risk means a hard signal was found — a threat-list classification, a rejected target, or a redirect chain that lands on a different registered domain than the one you were sent." },
      { q: "The site works fine for me. Why the warnings?", a: "Scam infrastructure is often geo-fenced, cloaked against bots, or already taken down in one region while still serving in another. Infrastructure evidence — a two-day-old certificate, no DMARC, forty SANs — does not depend on what your browser happens to see." },
      { q: "Can I check an email without the link?", a: "Yes. Paste the whole message. The language lexicon runs on text alone, and the report will tell you which evidence is missing because no URL was supplied." },
    ],
    related: [
      { href: "/tools/products", label: "Check the product being sold" },
      { href: "/tools/news", label: "Verify the claim in the message" },
      { href: "/legal/privacy", label: "How submitted URLs are handled" },
    ],
  },
  products: {
    slug: "products",
    category: "product",
    eyebrow: "Service 01 — Product Identifier",
    title: "The number is valid. The object may not be.",
    accent: "text-brand-400",
    lede:
      "Counterfeiters copy genuine identifiers from authentic packaging, so a lookup that returns 'valid' is the least informative possible answer. This module separates three things the market conflates: whether an identifier is mathematically valid, whether it is attributable to a documented product, and whether the object in front of you is authentic — which no database can decide.",
    checks: [
      { title: "IMEI Luhn validation", body: "A real 15-digit IMEI always satisfies the Luhn check digit. A failure proves the string was mistyped or invented — a pass proves only that the number is structurally valid." },
      { title: "GS1 barcode mathematics", body: "Validates EAN-13, UPC-A, EAN-8 and GTIN-14 check digits with the GS1 modulo-10 algorithm, then reads the prefix to identify the numbering block and flag Bookland (978/979) codes presented as electronics." },
      { title: "Model-code normalisation and matching", body: "Strips punctuation, folds case, generates sliding-window fragments and computes edit distance so 'SM-S928B/DS', 'SM S928B' and 'sms928b' all resolve to the same record." },
      { title: "Specification cross-checking", body: "Compares display size, battery capacity, memory, storage, camera resolution, weight and charging power in your submission against the documented values — and flags capacities the manufacturer never shipped." },
      { title: "Price plausibility by category", body: "A quoted price far below the category floor is a hard warning. Genuine stock is not sold below the cost of its components, whatever the listing claims about clearance or overstock." },
      { title: "Seller-language screening", body: "Runs the scam lexicon over listing text: '1:1', 'AAA quality', 'mirror quality', irreversible payment methods, artificial scarcity and guaranteed-delivery claims." },
      { title: "Published physical checks", body: "Every matched record carries the checks that actually decide authenticity for that product — hidden test menus, weight, materials, port negotiation, attestation and app pairing." },
    ],
    cannot: [
      "Prove a physical item is genuine. A matching model code confirms the code is attributable to a documented product; counterfeiters copy real codes.",
      "Query a manufacturer serial-number API. Most manufacturers do not expose one publicly, and SG16 does not claim to have checked a registry it has not licensed.",
      "Map an IMEI TAC to a model without a licensed GSMA type-allocation database — this is reported as unknown rather than guessed.",
      "Guarantee counterfeit detection. Any service that advertises that without manufacturer support is overstating what a lookup can do.",
    ],
    sources: [
      { name: "SG16 identifier mathematics", role: "Luhn, GS1 modulo-10, normalisation, edit distance", status: "always on" },
      { name: "Internal product catalogue", role: "Normalised model records, specifications, counterfeit signals", status: "always on" },
      { name: "Category price floors", role: "Plausibility screening of quoted prices", status: "always on" },
      { name: "Manufacturer specification pages", role: "Linked in every matched report for direct comparison", status: "linked" },
      { name: "AI analyst (optional)", role: "Comparing messy listing text against a structured record", status: "key-dependent" },
    ],
    examples: [
      { label: "IMEI that fails Luhn", value: "IMEI 356938035643800 — iPhone 15 Pro Max, brand new sealed, 256GB, $520, ships worldwide" },
      { label: "Spec contradiction", value: "Galaxy A55 5G SM-A556B, 6.1 inch display, 3000mAh battery, 45W charging, $180 new in box" },
      { label: "Charger with a copied barcode", value: "Anker A2147 Nano 3 30W, bulk lot of 200 units, EAN 4006381333931, $6.50 each, 100% original guaranteed" },
      { label: "Footwear SKU format", value: "Air Jordan 1 Retro High OG, size label SKU 555088-134, box label SKU 555088-101, $95 shipped" },
    ],
    faq: [
      { q: "The IMEI passed. Does that mean the phone is real?", a: "No. It means the fifteen digits satisfy the Luhn algorithm, which any generated number can be made to do. A cloned IMEI from a genuine handset passes perfectly. Use the manufacturer's own coverage checker and the physical checks in the report." },
      { q: "Why did the barcode check fail?", a: "The GS1 modulo-10 check digit did not compute. Genuine retail packaging does not carry invalid check digits, so the code was mistyped, invented, or produced by a tool that ignored the algorithm. That is a hard signal, and the report says so." },
      { q: "Is your catalogue authoritative?", a: "No, and every report says so. It is an SG16-normalised starter dataset of popular electronics with specification ranges and known counterfeit signals. A non-match means the record is absent, not that the product does not exist. Licensed manufacturer and GS1 feeds are a later phase." },
      { q: "Can you check a listing URL too?", a: "Yes. If your submission contains both a product identifier and a URL, SG16 runs the product workflow first and then merges a full seller and domain sweep into one report — specification checks and infrastructure checks together." },
    ],
    related: [
      { href: "/tools/websites", label: "Check the seller's domain" },
      { href: "/tools/media", label: "Check the product photos" },
      { href: "/business", label: "Bulk catalogue checks for teams" },
    ],
  },
  media: {
    slug: "media",
    category: "media",
    eyebrow: "Service 04 — Image & Video Identifier",
    title: "What the file proves, and what it cannot.",
    accent: "text-brand-400",
    lede:
      "Most misleading media is not fabricated — it is genuine and attached to the wrong event, date or place. And a classifier that says 'AI-generated' is not proof of anything. This module reads the actual bytes of your file and reports the container structure, metadata, provenance manifests and generator signatures it finds, with the limits stated in the same breath.",
    checks: [
      { title: "Container parsing from raw bytes", body: "Walks the JPEG segment chain, the PNG chunk list and the WebP RIFF structure directly. No third-party decoder, no upload to anybody else's server." },
      { title: "EXIF capture evidence", body: "Recovers Make, Model, Lens, Software, DateTimeOriginal, DateTime, GPS presence, orientation, resolution and embedded thumbnails — and notes when a file was re-saved after capture." },
      { title: "C2PA / Content Credentials detection", body: "Finds the JPEG APP11 JUMBF carrier, the PNG caBX chunk and the WebP 'JP' chunk that hold a signed provenance manifest, and reports the labels present." },
      { title: "Generative-tool signature scan", body: "Searches XMP packets, PNG tEXt/iTXt chunks and container strings for Stable Diffusion, AUTOMATIC1111, ComfyUI, Midjourney, OpenAI, Firefly, FLUX, NovelAI, Runway and the IPTC generative digitalSourceType values." },
      { title: "JPEG structural profile", body: "Reports the marker path, quantisation table count, baseline versus progressive scan and restart markers — the fingerprints of how many encode passes a file has been through." },
      { title: "Shannon entropy profiling", body: "Computes bits-per-byte across the whole file. Values are reported with an honest interpretation: entropy alone does not discriminate real from synthetic." },
      { title: "Out-of-context detection", body: "When you supply the caption, date and place the media is being shared with, SG16 searches for earlier appearances and compares claimed dates with the earliest publication date it can find." },
    ],
    cannot: [
      "Perform pixel-level manipulation detection in this release. Metadata and provenance analysis cannot prove an image was, or was not, altered.",
      "Prove a depicted event happened. A signed C2PA manifest records file history — who created or edited the asset and with what tool — not the truth of the scene.",
      "Rule out synthetic origin when no marker exists. Most generators can be configured not to write metadata, and every social platform strips it on upload.",
      "Analyse video frame-by-frame yet. Attach a still frame for container forensics; full video workflows are a later phase.",
    ],
    sources: [
      { name: "Local container forensics", role: "JPEG / PNG / WebP parsing, EXIF, XMP, entropy", status: "always on" },
      { name: "C2PA detection", role: "APP11 JUMBF, PNG caBX, WebP JP manifest carriers", status: "always on" },
      { name: "Generator signature lexicon", role: "Known tool markers in metadata and container strings", status: "always on" },
      { name: "Licensed web search", role: "Earlier appearances and reporting about the same subject", status: "key-dependent" },
      { name: "Content Credentials verify", role: "Linked for full cryptographic manifest validation", status: "linked" },
    ],
    examples: [
      { label: "Attached screenshot", value: "This image was sent to me claiming to show an event last week. Is it genuine?" },
      { label: "Suspected AI render", value: "Someone posted this as a real photo of a shark swimming on a motorway during the flood. Check whether it is AI generated." },
      { label: "Out-of-context reuse", value: "This photo from 2011 is being shared as if it was taken during yesterday's protest." },
      { label: "Product photo check", value: "The seller sent these pictures of the handset. Are they stock images or real photos of the item?" },
    ],
    faq: [
      { q: "Why won't you just tell me if it's AI-generated?", a: "Because the honest answer requires evidence. SG16 reports what the file contains — a generator signature, a provenance manifest, a camera record, or nothing at all. A classifier score presented as proof produces false accusations against real photographers and false reassurance about synthetic ones." },
      { q: "The file has no metadata at all. Is that suspicious?", a: "No. Screenshots have none. Everything uploaded to WhatsApp, X, Instagram, Facebook or Telegram has had it stripped. A downloaded press image usually has none. Absence of EXIF is normal, and SG16 says so explicitly rather than treating it as a signal." },
      { q: "Where does my uploaded image go?", a: "It is parsed in memory on the server, hashed with SHA-256 for deduplication, and the extracted metadata is written into the report. The pixels are not stored, not published, not sold and not used to train any model." },
      { q: "What should I attach?", a: "The original file, not a screenshot of it. Each re-save destroys metadata, and a screenshot of a social post contains only the platform's own recompression — which tells you nothing about the source image." },
    ],
    related: [
      { href: "/tools/news", label: "Verify the claim the image supports" },
      { href: "/tools/products", label: "Check product photography" },
      { href: "/legal/limitations", label: "Verification limits in full" },
    ],
  },
};
