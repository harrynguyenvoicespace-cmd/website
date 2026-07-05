import { json } from "../utils/json";

export function handleHealth(): Response {
  return json({
    ok: true,
    service: "bloxlab-worker-api",
    time: new Date().toISOString()
  });
}
