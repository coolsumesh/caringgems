const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.json');

// Initialize database
function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading db:', e);
  }
  return {
    users: [],
    medications: [],
    logs: [],
    family: []
  };
}

function saveDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// User operations
function findUserByTelegramId(chatId) {
  const db = loadDb();
  return db.users.find(u => u.telegram_chat_id === String(chatId));
}

function findUserByPhone(phone) {
  const db = loadDb();
  return db.users.find(u => u.phone === phone);
}

function findUserById(id) {
  const db = loadDb();
  return db.users.find(u => u.id === id);
}

function createUser(user) {
  const db = loadDb();
  const id = Date.now();
  const newUser = {
    id,
    phone: user.phone || `tg_${user.telegram_chat_id}`,
    name: user.name || null,
    channel: user.channel || 'telegram',
    telegram_chat_id: user.telegram_chat_id ? String(user.telegram_chat_id) : null,
    reminder_time: user.reminder_time || '09:00',
    timezone: user.timezone || 'Asia/Kolkata',
    is_premium: user.is_premium || 0,
    premium_expires_at: null,
    trial_started_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  db.users.push(newUser);
  saveDb(db);
  return newUser;
}

function updateUser(id, updates) {
  const db = loadDb();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx !== -1) {
    db.users[idx] = { ...db.users[idx], ...updates };
    saveDb(db);
    return db.users[idx];
  }
  return null;
}

// Medication operations
function getMedicationsByUserId(userId) {
  const db = loadDb();
  return db.medications.filter(m => m.user_id === userId);
}

function getMedicationByUserId(userId) {
  const db = loadDb();
  return db.medications.find(m => m.user_id === userId);
}

function createMedication(med) {
  const db = loadDb();
  const id = Date.now();
  const newMed = {
    id,
    user_id: med.user_id,
    name: med.name || 'Daily Medication',
    dosage: med.dosage || '1 tablet',
    times_per_day: med.times_per_day || 1,
    reminder_times: med.reminder_times || null,
    created_at: new Date().toISOString()
  };
  db.medications.push(newMed);
  saveDb(db);
  return newMed;
}

// Log operations
function getLogsByUserId(userId, days = 7) {
  const db = loadDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];
  
  return db.logs
    .filter(l => l.user_id === userId && l.date >= sinceStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getTodayLog(userId) {
  const db = loadDb();
  const today = new Date().toISOString().split('T')[0];
  return db.logs.find(l => l.user_id === userId && l.date === today && l.taken === 1);
}

function createLog(log) {
  const db = loadDb();
  const id = Date.now();
  const newLog = {
    id,
    user_id: log.user_id,
    medication_id: log.medication_id || null,
    date: log.date || new Date().toISOString().split('T')[0],
    taken: log.taken || 0,
    taken_at: log.taken_at || null,
    reminded_at: log.reminded_at || null
  };
  db.logs.push(newLog);
  saveDb(db);
  return newLog;
}

// Family operations
function getWatchersByUserId(userId) {
  const db = loadDb();
  return db.family.filter(f => f.user_id === userId && f.notify_on_taken === 1);
}

function createWatcher(watcher) {
  const db = loadDb();
  const id = Date.now();
  const newWatcher = {
    id,
    user_id: watcher.user_id,
    watcher_phone: watcher.watcher_phone,
    watcher_name: watcher.watcher_name || null,
    notify_on_taken: watcher.notify_on_taken !== undefined ? watcher.notify_on_taken : 1,
    notify_on_missed: watcher.notify_on_missed !== undefined ? watcher.notify_on_missed : 1,
    channel: watcher.channel || 'telegram',
    telegram_chat_id: watcher.telegram_chat_id || null
  };
  db.family.push(newWatcher);
  saveDb(db);
  return newWatcher;
}

// Get all users for reminder at specific time
function getUsersForReminder(time) {
  const db = loadDb();
  const users = db.users.filter(u => u.reminder_time === time);
  
  return users.map(user => {
    const medication = db.medications.find(m => m.user_id === user.id);
    return {
      ...user,
      medication_name: medication?.name || 'Daily Medication',
      medication_id: medication?.id
    };
  });
}

// Get all users
function getAllUsers() {
  const db = loadDb();
  return db.users;
}

module.exports = {
  findUserByTelegramId,
  findUserByPhone,
  findUserById,
  createUser,
  updateUser,
  getMedicationsByUserId,
  getMedicationByUserId,
  createMedication,
  getLogsByUserId,
  getTodayLog,
  createLog,
  getWatchersByUserId,
  createWatcher,
  getUsersForReminder,
  getAllUsers
};
