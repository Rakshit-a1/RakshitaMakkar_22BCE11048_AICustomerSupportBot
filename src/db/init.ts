import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type DB = Database.Database;

export function createDatabase(dbPath: string): DB {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // sessions: one per conversation
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    );
  `).run();

  // messages: all turns, role=user|assistant|system|escalation
  db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
  `).run();

  // FAQs with FTS virtual table for fast retrieval
  db.prepare(`
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL
    );
  `).run();

  db.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS faqs_fts USING fts5(question, answer, content='faqs', content_rowid='id')`).run();

  // Trigger to sync FTS index
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS faqs_ai AFTER INSERT ON faqs BEGIN
      INSERT INTO faqs_fts(rowid, question, answer) VALUES (new.id, new.question, new.answer);
    END;
    CREATE TRIGGER IF NOT EXISTS faqs_ad AFTER DELETE ON faqs BEGIN
      INSERT INTO faqs_fts(faqs_fts, rowid, question, answer) VALUES('delete', old.id, old.question, old.answer);
    END;
    CREATE TRIGGER IF NOT EXISTS faqs_au AFTER UPDATE ON faqs BEGIN
      INSERT INTO faqs_fts(faqs_fts, rowid, question, answer) VALUES('delete', old.id, old.question, old.answer);
      INSERT INTO faqs_fts(rowid, question, answer) VALUES (new.id, new.question, new.answer);
    END;
  `);

  return db;
}


