const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const whatsapp = require('./whatsapp');

// Get users who need reminders at current time
function getUsersForReminder(time) {
  const stmt = db.prepare(`
    SELECT u.*, m.name as medication_name, m.id as medication_id
    FROM users u
    JOIN medications m ON m.user_id = u.id
    WHERE u.reminder_time = ?
  `);
  return stmt.all(time);
}

// Mark medication as taken
function markTaken(userId, medicationId, date) {
  const stmt = db.prepare(`
    INSERT INTO logs (user_id, medication_id, date, taken, taken_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET taken = 1, taken_at = datetime('now')
  `);
  
  try {
    stmt.run(userId, medicationId, date);
    return true;
  } catch (e) {
    // If no unique constraint, just insert
    const insertStmt = db.prepare(`
      INSERT INTO logs (user_id, medication_id, date, taken, taken_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `);
    insertStmt.run(userId, medicationId, date);
    return true;
  }
}

// Get family watchers for a user
function getWatchers(userId) {
  const stmt = db.prepare(`
    SELECT * FROM family WHERE user_id = ? AND notify_on_taken = 1
  `);
  return stmt.all(userId);
}

// Send reminders for a specific time
async function sendReminders(time) {
  const users = getUsersForReminder(time);
  
  for (const user of users) {
    try {
      if (user.channel === 'telegram' && user.telegram_chat_id) {
        await telegram.sendReminder(user.telegram_chat_id, user.medication_name);
      } else if (user.channel === 'whatsapp' && user.is_premium) {
        await whatsapp.sendReminder(user.phone, user.medication_name);
      }
      
      // Log reminder sent
      const stmt = db.prepare(`
        INSERT INTO logs (user_id, medication_id, date, reminded_at)
        VALUES (?, ?, date('now'), datetime('now'))
      `);
      stmt.run(user.id, user.medication_id);
      
      console.log(`Reminder sent to ${user.name || user.phone}`);
    } catch (err) {
      console.error(`Failed to send reminder to ${user.phone}:`, err.message);
    }
  }
}

// Notify family when medication is taken
async function notifyWatchers(userId, userName, medicationName) {
  const watchers = getWatchers(userId);
  const now = new Date().toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  });
  
  for (const watcher of watchers) {
    try {
      if (watcher.channel === 'telegram' && watcher.telegram_chat_id) {
        await telegram.notifyFamily(watcher.telegram_chat_id, userName, medicationName, now);
      } else if (watcher.channel === 'whatsapp') {
        await whatsapp.notifyFamily(watcher.watcher_phone, userName, medicationName, now);
      }
    } catch (err) {
      console.error(`Failed to notify watcher ${watcher.watcher_phone}:`, err.message);
    }
  }
}

// Calculate streak for a user
function getStreak(userId) {
  const stmt = db.prepare(`
    SELECT date, taken FROM logs 
    WHERE user_id = ? 
    ORDER BY date DESC
  `);
  const logs = stmt.all(userId);
  
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let checkDate = today;
  
  for (const log of logs) {
    if (log.date === checkDate && log.taken) {
      streak++;
      // Go to previous day
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split('T')[0];
    } else if (log.date === checkDate) {
      break;
    }
  }
  
  return streak;
}

// Generate weekly report for a user
function generateWeeklyReport(userId, userName) {
  const stmt = db.prepare(`
    SELECT date, taken, taken_at FROM logs
    WHERE user_id = ?
    AND date >= date('now', '-7 days')
    ORDER BY date ASC
  `);
  const logs = stmt.all(userId);
  
  const streak = getStreak(userId);
  const taken = logs.filter(l => l.taken).length;
  const missed = 7 - taken;
  
  let report = `📊 *${userName}'s Weekly Report*\n\n`;
  report += `✅ Days taken: ${taken}/7\n`;
  report += `❌ Days missed: ${missed}\n`;
  report += `🔥 Current streak: ${streak} days\n\n`;
  
  if (taken === 7) {
    report += `🌟 Perfect week! Keep it up! 🌟`;
  } else if (missed <= 2) {
    report += `💪 Good effort! Almost there!`;
  } else {
    report += `⚠️ Let's try to do better this week!`;
  }
  
  return report;
}

// Start the cron scheduler
function startScheduler() {
  // Check every minute for reminders
  cron.schedule('* * * * *', () => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 5); // HH:MM
    sendReminders(time);
  });
  
  // Weekly report every Sunday at 10 AM IST (4:30 UTC)
  cron.schedule('30 4 * * 0', async () => {
    const users = db.prepare('SELECT * FROM users').all();
    for (const user of users) {
      const report = generateWeeklyReport(user.id, user.name || 'User');
      if (user.channel === 'telegram' && user.telegram_chat_id) {
        await telegram.sendWeeklyReport(user.telegram_chat_id, report);
      } else if (user.channel === 'whatsapp' && user.is_premium) {
        await whatsapp.sendWeeklyReport(user.phone, report);
      }
    }
  });
  
  console.log('⏰ Reminder scheduler started');
}

module.exports = {
  startScheduler,
  markTaken,
  notifyWatchers,
  getStreak,
  generateWeeklyReport
};
