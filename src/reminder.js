const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const whatsapp = require('./whatsapp');

// Send reminders for a specific time
async function sendReminders(time) {
  const users = db.getUsersForReminder(time);
  
  for (const user of users) {
    try {
      if (user.channel === 'telegram' && user.telegram_chat_id) {
        await telegram.sendReminder(user.telegram_chat_id, user.medication_name);
      } else if (user.channel === 'whatsapp' && user.is_premium) {
        await whatsapp.sendReminder(user.phone, user.medication_name);
      }
      
      // Log reminder sent
      db.createLog({
        user_id: user.id,
        medication_id: user.medication_id,
        reminded_at: new Date().toISOString()
      });
      
      console.log(`Reminder sent to ${user.name || user.phone}`);
    } catch (err) {
      console.error(`Failed to send reminder to ${user.phone}:`, err.message);
    }
  }
}

// Mark medication as taken
function markTaken(userId, medicationId) {
  const today = new Date().toISOString().split('T')[0];
  
  // Check if already logged today
  const existing = db.getTodayLog(userId);
  if (existing) {
    return false;
  }
  
  db.createLog({
    user_id: userId,
    medication_id: medicationId,
    date: today,
    taken: 1,
    taken_at: new Date().toISOString()
  });
  
  return true;
}

// Notify family when medication is taken
async function notifyWatchers(userId, userName, medicationName) {
  const watchers = db.getWatchersByUserId(userId);
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
  const logs = db.getLogsByUserId(userId, 30);
  
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let checkDate = today;
  
  // Sort logs by date descending
  const sortedLogs = logs.sort((a, b) => b.date.localeCompare(a.date));
  
  for (const log of sortedLogs) {
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
  const logs = db.getLogsByUserId(userId, 7);
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
    // Convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const time = ist.toISOString().slice(11, 16); // HH:MM
    sendReminders(time);
  });
  
  // Weekly report every Sunday at 10 AM IST (4:30 UTC)
  cron.schedule('30 4 * * 0', async () => {
    const users = db.getAllUsers();
    for (const user of users) {
      const report = generateWeeklyReport(user.id, user.name || 'User');
      try {
        if (user.channel === 'telegram' && user.telegram_chat_id) {
          await telegram.sendWeeklyReport(user.telegram_chat_id, report);
        } else if (user.channel === 'whatsapp' && user.is_premium) {
          await whatsapp.sendWeeklyReport(user.phone, report);
        }
      } catch (err) {
        console.error(`Failed to send report to ${user.phone}:`, err.message);
      }
    }
  });
  
  console.log('⏰ Reminder scheduler started');
}

module.exports = {
  startScheduler,
  sendReminders,
  markTaken,
  notifyWatchers,
  getStreak,
  generateWeeklyReport
};
