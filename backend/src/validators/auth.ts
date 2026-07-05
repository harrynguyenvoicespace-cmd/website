import type { LoginRequest } from "../../../shared/contracts/api";

type ValidationResult =
  | { ok: true; value: LoginRequest }
  | { ok: false; message: string };

export function validateLoginPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Missing login payload" };
  }

  const record = payload as Record<string, unknown>;
  const email = String(record.email || "").trim();
  const password = String(record.password || "");

  if (!email.includes("@")) {
    return { ok: false, message: "Email is invalid" };
  }

  if (password.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters" };
  }

  return { ok: true, value: { email, password } };
}
