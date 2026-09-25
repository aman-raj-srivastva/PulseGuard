# PulseGuard • Autonomous Website & Multi-Page Uptime Monitor

A full-stack, autonomous website health and uptime monitoring system with multi-page inspection and instant multi-channel alert dispatching.

---

## 🌟 Key Features

1. **Autonomous Engine (No Site Authentication Required)**
   - Runs background health checks via pure HTTP/HTTPS requests with zero dependencies on WordPress plugins or target site access.
   - Built-in scheduler runs automatically every 5 minutes (customizable per site from 1m to 30m).

2. **Multi-Page Inspection per Website (Minimum 3 Pages)**
   - Monitors multiple critical endpoints per site (e.g., `/`, `/wp-login.php`, `/wp-json/`, `/shop`, `/contact`).
   - If any endpoint throws a 4xx/5xx status, times out, or fails to connect, it logs the error and increments failure counts.

3. **Smart Outage & Recovery Alerting**
   - **Customizable Consecutive Failure Threshold:** Triggers alerts only when a site fails $N$ consecutive check cycles (default: 3 cycles) to eliminate false positives from transient blips.
   - **Automatic Recovery Detection:** Dispatches a "Site Recovered / Back Online" alert with calculated downtime duration when the site comes back UP.

4. **Multi-Channel Alert Dispatcher (Checkbox Selection)**
   - 📱 **Telegram Bot:** Direct rich markdown notifications to your chat or channel.
   - ✉️ **Email (SMTP):** Clean HTML outage reports sent via Gmail, Hostinger SMTP, or custom mail server.
   - 💬 **WhatsApp:** Instant WhatsApp alerts via CallMeBot API or Custom Webhook.
   - Each site can have individual channel checkboxes enabled or disabled.
   - Built-in "Test Notification" buttons in the dashboard.

5. **Live Log Monitoring & Incident Tracker**
   - Live stream of every inspection: Timestamp, HTTP Code, Latency (ms), Monitored Path, Error trace.
   - Filter logs by Website, UP/DOWN status, or keyword search.
   - Export logs to CSV with one click or clear log history.

---

## 🚀 Running on Localhost

The server is currently running on:
👉 **[http://localhost:3000](http://localhost:3000)**

To start or restart anytime:
```bash
cd site-monitor
npm start
```

---

## ⚙️ Alert Channels Setup Guide

Click **"Alert Channels"** in the top-right navbar:

### 1. Telegram Setup
1. Message [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot` to get your **Bot Token**.
2. Message [@userinfobot](https://t.me/userinfobot) to get your numerical **Chat ID**.
3. Toggle ON, paste the Token and Chat ID, and click **"Test Telegram Alert"**.

### 2. Email (SMTP) Setup
1. Enter your SMTP Host (e.g. `smtp.gmail.com` or `smtp.hostinger.com`), Port (`587`), and your email/password (or Google App Password).
2. Enter your recipient email in `Alert Recipient Email (To:)`.
3. Toggle ON and click **"Test Email Alert"**.

### 3. WhatsApp Setup (CallMeBot API)
1. Add `+34 941 070 123` to your WhatsApp contacts.
2. Send the message: `I allow callmebot to send me messages` to that contact.
3. CallMeBot will reply with your personal API Key.
4. Enter your phone number with country code (e.g. `+919876543210`) and the API Key in PulseGuard, toggle ON, and click **"Test WhatsApp Alert"**.
