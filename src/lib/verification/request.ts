import type { VerifyRequest } from "@/lib/types";

const ALLOWED_CATEGORIES = new Set(["claim", "website", "product", "media", "auto"]);

/** Shape checks shared by /api/verify and /v1/verify; null when the body is acceptable. */
export function verifyRequestProblem(body: VerifyRequest): { status: number; error: string } | null {
  if (!body || typeof body !== "object") return { status: 400, error: "Request body must be a JSON object." };
  if (typeof body.input !== "string" && !body.file) return { status: 400, error: "Field 'input' must be a string." };
  if (body.category && !ALLOWED_CATEGORIES.has(body.category)) return { status: 400, error: `Unknown category "${body.category}".` };
  if ((body.input ?? "").length > 20000) return { status: 413, error: "Input exceeds 20,000 characters." };
  return null;
}
