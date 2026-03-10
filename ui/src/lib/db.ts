import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(
  process.cwd(),
  "..",
  "codenames.db"
);

let _db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  if (!_db) {
    if (!fs.existsSync(DB_PATH)) {
      return null;
    }
    try {
      _db = new Database(DB_PATH, { readonly: true });
    } catch {
      return null;
    }
  }
  return _db;
}
