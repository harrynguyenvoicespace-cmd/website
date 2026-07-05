export function createSessionToken(): string {
  return crypto.randomUUID();
}
