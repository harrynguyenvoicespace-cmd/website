import type { ContactRequest } from "../../../shared/contracts/api";

type ValidationResult =
  | { ok: true; value: ContactRequest }
  | { ok: false; message: string };

export function validateContactPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Missing contact payload" };
  }

  const record = payload as Record<string, unknown>;
  const email = String(record.email || "").trim();
  const message = String(record.message || "").trim();

  if (!email.includes("@")) {
    return { ok: false, message: "Email is invalid" };
  }

  if (message.length < 3) {
    return { ok: false, message: "Message is too short" };
  }

  return { ok: true, value: { email, message } };
}
