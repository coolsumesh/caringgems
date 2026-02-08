const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, options = {}) {
  const data = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: options.parseMode || 'HTML',
    reply_markup: options.replyMarkup
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/sendMessage`);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendReminder(chatId, medicationName) {
  const text = `💊 <b>Medication Reminder</b>\n\nTime to take your <b>${medicationName}</b>!\n\nHave you taken it? Reply with <b>yes</b> or <b>taken</b>`;
  
  return sendMessage(chatId, text, {
    replyMarkup: JSON.stringify({
      inline_keyboard: [[
        { text: '✅ Taken', callback_data: 'taken' },
        { text: '⏰ Snooze 30min', callback_data: 'snooze_30' }
      ]]
    })
  });
}

async function sendWeeklyReport(chatId, report) {
  return sendMessage(chatId, report);
}

async function notifyFamily(chatId, userName, medicationName, takenAt) {
  const text = `✅ <b>${userName}</b> took their <b>${medicationName}</b> at ${takenAt}`;
  return sendMessage(chatId, text);
}

module.exports = {
  sendMessage,
  sendReminder,
  sendWeeklyReport,
  notifyFamily
};
