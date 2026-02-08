const https = require('https');

const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

async function sendMessage(to, text) {
  // Format phone number (remove + and spaces)
  const phone = to.replace(/[^0-9]/g, '');
  
  const data = JSON.stringify({
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: { body: text }
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
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

async function sendReminder(phone, medicationName) {
  const text = `💊 *Medication Reminder*\n\nTime to take your *${medicationName}*!\n\nReply with *yes* or *taken* when done.`;
  return sendMessage(phone, text);
}

async function sendWeeklyReport(phone, report) {
  return sendMessage(phone, report);
}

async function notifyFamily(phone, userName, medicationName, takenAt) {
  const text = `✅ *${userName}* took their *${medicationName}* at ${takenAt}`;
  return sendMessage(phone, text);
}

module.exports = {
  sendMessage,
  sendReminder,
  sendWeeklyReport,
  notifyFamily
};
