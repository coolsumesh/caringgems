# CaringGems 💎

> Little reminders that show you care

Medication reminders via WhatsApp & Telegram. No app needed.

## Features

- 💊 Daily medication reminders
- 📱 WhatsApp (paid) & Telegram (free) support
- ✅ Simple "yes/taken" confirmation
- 📊 Weekly reports & streak tracking
- 👨‍👩‍👧 Family monitoring (notify spouse/children)

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (MVP) → PostgreSQL (scale)
- **Messaging:** Telegram Bot API (free) + WhatsApp Business API (paid)
- **Payments:** Razorpay (India)
- **Hosting:** AWS / Any VPS

## Pricing Model

| Tier | Channel | Price |
|------|---------|-------|
| Free | Telegram | ₹0 forever |
| Premium | WhatsApp | ₹99/month |

## Getting Started

```bash
npm install
cp .env.example .env
# Add your API keys
npm run dev
```

## License

MIT
