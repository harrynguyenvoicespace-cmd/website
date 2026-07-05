import { handleAuth } from "./routes/auth";
import { handleContact } from "./routes/contact";
import { handleHealth } from "./routes/health";
import { withCors } from "./middleware/cors";
import { withSecurityHeaders } from "./middleware/security";
import { json } from "./utils/json";

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      let response: Response;

      if (url.pathname === "/api/health") {
        response = handleHealth();
      } else if (url.pathname.startsWith("/api/auth")) {
        response = await handleAuth(request, env, ctx);
      } else if (url.pathname === "/api/contact") {
        response = await handleContact(request, env, ctx);
      } else {
        response = json({ ok: false, message: "Route not found" }, 404);
      }

      return withCors(withSecurityHeaders(response));
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_error", message: String(error) }));
      return withCors(withSecurityHeaders(json({ ok: false, message: "Internal error" }, 500)));
    }
  }
};

