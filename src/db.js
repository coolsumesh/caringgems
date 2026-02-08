const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'caringgems.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    channel TEXT DEFAULT 'telegram',  -- 'telegram' or 'whatsapp'
    telegram_chat_id TEXT,
    reminder_time TEXT DEFAULT '09:00',  -- HH:MM in user's timezone
    timezone TEXT DEFAULT 'Asia/Kolkata',
    is_premium INTEGER DEFAULT 0,
    premium_expires_at TEXT,
    trial_started_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT,
    times_per_day INTEGER DEFAULT 1,
    reminder_times TEXT,  -- JSON array of times
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medication_id INTEGER,
    date TEXT NOT NULL,
    taken INTEGER DEFAULT 0,
    taken_at TEXT,
    reminded_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (medication_id) REFERENCES medications(id)
  );

  CREATE TABLE IF NOT EXISTS family (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    watcher_phone TEXT NOT NULL,
    watcher_name TEXT,
    notify_on_taken INTEGER DEFAULT 1,
    notify_on_missed INTEGER DEFAULT 1,
    channel TEXT DEFAULT 'telegram',
    telegram_chat_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_logs_user_date ON logs(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
`);

module.exports = db;
