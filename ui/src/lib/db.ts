import { createClient, type Client } from "@libsql/client";

let _client: Client | null = null;

export function getDb(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url) {
      // Remote Turso database (production / Vercel)
      _client = createClient({ url, authToken });
    } else {
      // Local SQLite file (development)
      _client = createClient({ url: "file:../codenames.db" });
    }
  }
  return _client;
}
