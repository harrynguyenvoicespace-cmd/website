import type { Env } from "../index";
import { createSessionToken } from "../services/token";
import { validateLoginPayload } from "../validators/auth";
import { readJson } from "../utils/json";
import { json } from "../utils/json";

export async function handleAuth(
  request: Request,
  _env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const result = validateLoginPayload(body);

    if (!result.ok) {
      return json({ ok: false, message: result.message }, 400);
    }

    return json({
      token: createSessionToken(),
      user: {
        email: result.value.email,
        name: "BloxLab Builder"
      },
      expiresIn: 86400
    });
  }

  return json({ ok: false, message: "Auth route not found" }, 404);
}
