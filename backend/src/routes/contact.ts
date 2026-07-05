import type { Env } from "../index";
import { validateContactPayload } from "../validators/contact";
import { readJson } from "../utils/json";
import { json } from "../utils/json";

export async function handleContact(
  request: Request,
  _env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  const body = await readJson(request);
  const result = validateContactPayload(body);

  if (!result.ok) {
    return json({ ok: false, message: result.message }, 400);
  }

  ctx.waitUntil(
    Promise.resolve(
      console.log(JSON.stringify({ event: "contact_received", email: result.value.email }))
    )
  );

  return json({ ok: true, message: "Contact received" });
}
