require('dotenv').config();

const express = require('express');
const db = require('./db');
const telegram = require('./telegram');
const whatsapp = require('./whatsapp');
const { startScheduler, markTaken, notifyWatchers, getStreak } = require('./reminder');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'CaringGems' });
});

// Telegram webhook
app.post('/webhook/telegram', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    if (callback_query) {
      // Handle button clicks
      const chatId = callback_query.message.chat.id;
      const data = callback_query.data;
      
      if (data === 'taken') {
        await handleTaken(chatId, 'telegram');
      }
      // TODO: Handle snooze
    }
    
    if (message && message.text) {
      const chatId = message.chat.id;
      const text = message.text.toLowerCase().trim();
      
      if (text === '/start') {
        await handleStart(chatId, message.from, 'telegram');
      } else if (text.startsWith('/time ')) {
        await handleSetTime(chatId, text.replace('/time ', '').trim());
      } else if (text === '/status') {
        await handleStatus(chatId);
      } else if (['yes', 'taken', 'done', 'yep', 'yeah', 'y'].includes(text)) {
        await handleTaken(chatId, 'telegram');
      }
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.sendStatus(500);
  }
});

// WhatsApp webhook verification
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp webhook
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { entry } = req.body;
    
    if (entry && entry[0].changes) {
      const change = entry[0].changes[0];
      if (change.value.messages) {
        const msg = change.value.messages[0];
        const phone = msg.from;
        const text = msg.text?.body?.toLowerCase().trim();
        
        if (['yes', 'taken', 'done', 'yep', 'yeah', 'y'].includes(text)) {
          await handleTaken(phone, 'whatsapp');
        }
      }
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.sendStatus(500);
  }
});

// Handle /start command
async function handleStart(chatId, from, channel) {
  const name = from.first_name || 'there';
  
  // Check if user exists
  let user = db.findUserByTelegramId(chatId);
  
  if (!user) {
    // Create new user
    user = db.createUser({
      name,
      channel,
      telegram_chat_id: chatId
    });
    
    // Create default medication
    db.createMedication({
      user_id: user.id,
      name: 'Daily Medication',
      dosage: '1 tablet'
    });
  }
  
  const welcome = `
💎 <b>Welcome to CaringGems!</b>

Hi ${name}! I'll help you remember your daily medications.

<b>How it works:</b>
• I'll send you a reminder every day at <b>${user.reminder_time}</b> IST
• Reply <b>yes</b> or <b>taken</b> when you've taken it
• Get weekly reports of your progress

<b>Commands:</b>
/time HH:MM - Set reminder time (e.g., /time 09:00)
/status - Check your streak

🆓 <b>Free on Telegram forever!</b>
Want WhatsApp reminders? Visit caringgems.in

Let's keep you healthy! 💊
  `.trim();
  
  await telegram.sendMessage(chatId, welcome);
}

// Handle /time command
async function handleSetTime(chatId, timeStr) {
  const user = db.findUserByTelegramId(chatId);
  
  if (!user) {
    await telegram.sendMessage(chatId, 'Please /start first!');
    return;
  }
  
  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(timeStr)) {
    await telegram.sendMessage(chatId, '❌ Invalid time format. Use HH:MM (e.g., 09:00 or 21:30)');
    return;
  }
  
  // Normalize to HH:MM
  const [hours, minutes] = timeStr.split(':');
  const normalizedTime = `${hours.padStart(2, '0')}:${minutes}`;
  
  db.updateUser(user.id, { reminder_time: normalizedTime });
  
  await telegram.sendMessage(chatId, `✅ Reminder time set to <b>${normalizedTime}</b> IST\n\nYou'll get your daily reminder at this time.`);
}

// Handle /status command
async function handleStatus(chatId) {
  const user = db.findUserByTelegramId(chatId);
  
  if (!user) {
    await telegram.sendMessage(chatId, 'Please /start first!');
    return;
  }
  
  const streak = getStreak(user.id);
  const todayLog = db.getTodayLog(user.id);
  
  let status = `📊 <b>Your Status</b>\n\n`;
  status += `🔥 Current streak: <b>${streak} days</b>\n`;
  status += `⏰ Reminder time: <b>${user.reminder_time}</b> IST\n`;
  status += `📅 Today: ${todayLog ? '✅ Taken' : '⏳ Pending'}\n`;
  
  if (streak >= 7) {
    status += `\n🌟 Amazing! Keep up the great work!`;
  } else if (streak >= 3) {
    status += `\n💪 Good going! Build that streak!`;
  } else {
    status += `\n🎯 Let's build a healthy habit!`;
  }
  
  await telegram.sendMessage(chatId, status);
}

// Handle medication taken
async function handleTaken(identifier, channel) {
  let user;
  
  if (channel === 'telegram') {
    user = db.findUserByTelegramId(identifier);
  } else {
    user = db.findUserByPhone(identifier);
  }
  
  if (!user) {
    console.log('User not found:', identifier);
    if (channel === 'telegram') {
      await telegram.sendMessage(identifier, 'Please /start first!');
    }
    return;
  }
  
  // Get medication
  const medication = db.getMedicationByUserId(user.id);
  
  if (!medication) {
    console.log('No medication found for user:', user.id);
    return;
  }
  
  // Check if already logged today
  const existing = db.getTodayLog(user.id);
  
  if (existing) {
    if (channel === 'telegram') {
      await telegram.sendMessage(identifier, '✅ Already noted for today! 😊');
    } else {
      await whatsapp.sendMessage(identifier, '✅ Already noted for today! 😊');
    }
    return;
  }
  
  // Mark as taken
  markTaken(user.id, medication.id);
  
  // Get streak
  const streak = getStreak(user.id);
  
  let response = streak > 1 
    ? `Great! ✅ Recorded!\n\n🔥 ${streak} day streak! Keep it up!`
    : `Great! ✅ Recorded!`;
  
  if (streak === 7) {
    response += `\n\n🎉 One week streak! Amazing!`;
  } else if (streak === 30) {
    response += `\n\n🏆 30 day streak! You're a champion!`;
  }
  
  if (channel === 'telegram') {
    await telegram.sendMessage(identifier, response);
  } else {
    await whatsapp.sendMessage(identifier, response);
  }
  
  // Notify family
  await notifyWatchers(user.id, user.name || 'User', medication.name);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`💎 CaringGems running on port ${PORT}`);
  startScheduler();
});
