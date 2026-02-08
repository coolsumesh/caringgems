require('dotenv').config();

const express = require('express');
const db = require('./db');
const telegram = require('./telegram');
const whatsapp = require('./whatsapp');
const { startScheduler, markTaken, notifyWatchers } = require('./reminder');

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
      } else if (['yes', 'taken', 'done', 'yep', 'yeah'].includes(text)) {
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
        
        if (['yes', 'taken', 'done', 'yep', 'yeah'].includes(text)) {
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
  let user = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
  
  if (!user) {
    // Create new user
    const stmt = db.prepare(`
      INSERT INTO users (phone, name, channel, telegram_chat_id, trial_started_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(`tg_${chatId}`, name, channel, chatId);
    
    // Create default medication
    user = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
    db.prepare(`
      INSERT INTO medications (user_id, name, dosage)
      VALUES (?, 'Daily Medication', '1 tablet')
    `).run(user.id);
  }
  
  const welcome = `
💎 <b>Welcome to CaringGems!</b>

Hi ${name}! I'll help you remember your daily medications.

<b>How it works:</b>
• I'll send you a reminder every day
• Reply <b>yes</b> or <b>taken</b> when you've taken it
• Get weekly reports of your progress

<b>Commands:</b>
/start - This message
/time HH:MM - Set reminder time (e.g., /time 09:00)
/status - Check your streak

🆓 <b>Free on Telegram forever!</b>
Want WhatsApp reminders? Upgrade to Premium.

Let's keep you healthy! 💊
  `.trim();
  
  await telegram.sendMessage(chatId, welcome);
}

// Handle medication taken
async function handleTaken(identifier, channel) {
  let user;
  
  if (channel === 'telegram') {
    user = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(identifier);
  } else {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier);
  }
  
  if (!user) {
    console.log('User not found:', identifier);
    return;
  }
  
  // Get medication
  const medication = db.prepare('SELECT * FROM medications WHERE user_id = ?').get(user.id);
  
  if (!medication) {
    console.log('No medication found for user:', user.id);
    return;
  }
  
  // Mark as taken
  const today = new Date().toISOString().split('T')[0];
  
  // Check if already logged today
  const existing = db.prepare(`
    SELECT * FROM logs WHERE user_id = ? AND date = ? AND taken = 1
  `).get(user.id, today);
  
  if (existing) {
    if (channel === 'telegram') {
      await telegram.sendMessage(identifier, '✅ Already noted for today! 😊');
    } else {
      await whatsapp.sendMessage(identifier, '✅ Already noted for today! 😊');
    }
    return;
  }
  
  // Log it
  db.prepare(`
    INSERT INTO logs (user_id, medication_id, date, taken, taken_at)
    VALUES (?, ?, ?, 1, datetime('now'))
  `).run(user.id, medication.id, today);
  
  // Get streak
  const { getStreak } = require('./reminder');
  const streak = getStreak(user.id);
  
  const response = streak > 1 
    ? `Great! ✅ Recorded!\n\n🔥 ${streak} day streak! Keep it up!`
    : `Great! ✅ Recorded!`;
  
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
