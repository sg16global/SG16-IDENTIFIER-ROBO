import { db, json } from "@/db";
import { POLICIES, consumeRateLimit, requestFingerprint } from "@/lib/security/rate-limit";
import { parseUntrustedUrl } from "@/lib/security/url-guard";
import { newId } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Revenue & relationship endpoints (blueprint §10).
 * Affiliate clicks are recorded *before* redirecting so every commercial
 * relationship stays auditable and disclosed.
 */
export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request.headers);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = String(body.action ?? "");

  if (action === "affiliate-click") {
    const limit = await consumeRateLimit(fingerprint, POLICIES.affiliate);
    if (!limit.allowed) return Response.json({ ok: false, error: "Too many requests." }, { status: 429 });
    const destination = String(body.destination ?? "");
    const guard = parseUntrustedUrl(destination);
    if (!guard.ok) return Response.json({ ok: false, error: guard.reason }, { status: 400 });
    await db.run(
      "insert into affiliate_events (id, report_id, retailer, product_ref, destination, disclosed) values (?, ?, ?, ?, ?, 1)",
      newId(),
      body.reportId ? String(body.reportId).slice(0, 64) : null,
      String(body.retailer ?? "unknown").slice(0, 96),
      String(body.productRef ?? "").slice(0, 160),
      guard.url!.toString(),
    );
    return Response.json({ ok: true, disclosed: true, destination: guard.url!.toString() });
  }

  if (action === "newsletter") {
    const limit = await consumeRateLimit(fingerprint, POLICIES.newsletter);
    if (!limit.allowed) return Response.json({ ok: false, error: "Too many sign-ups from this connection." }, { status: 429 });
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 220) {
      return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }
    await db.run(
      "insert or ignore into newsletter_subscribers (id, email, interest) values (?, ?, ?)",
      newId(),
      email,
      body.interest ? String(body.interest).slice(0, 64) : null,
    );
    return Response.json({ ok: true, message: "Subscribed. No tracking pixels, no resale of your address." });
  }

  if (action === "business-interest") {
    const limit = await consumeRateLimit(fingerprint, POLICIES.feedback);
    if (!limit.allowed) return Response.json({ ok: false, error: "Too many requests." }, { status: 429 });
    const organization = String(body.organization ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!organization || organization.length > 160) {
      return Response.json({ ok: false, error: "Organisation name is required." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return Response.json({ ok: false, error: "A valid work email is required." }, { status: 400 });
    }
    await db.run(
      `insert into business_accounts (id, organization, contact_email, plan, monthly_quota, status, notes)
       values (?, ?, ?, ?, ?, 'pending', ?)`,
      newId(),
      organization,
      email,
      String(body.plan ?? "starter").slice(0, 32),
      Number(body.quota ?? 1000),
      body.notes ? String(body.notes).slice(0, 2000) : null,
    );
    await db.run(
      "insert into audit_events (id, actor, action, meta) values (?, 'public', 'business-interest', ?)",
      newId(),
      json({ organization, plan: body.plan ?? "starter" }),
    );
    return Response.json({
      ok: true,
      message: "Request recorded. Business verification is provisioned manually — you will be contacted at the address supplied.",
    });
  }

  return Response.json({ ok: false, error: `Unknown action "${action}".` }, { status: 400 });
}
