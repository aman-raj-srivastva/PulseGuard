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

## 🧪 Live Testing & Sandbox Simulator

We provide a live cloud simulator to test PulseGuard's detection and alerting capabilities without needing real server outages.

### 1. Test Site Endpoints
* **Simulated Website URL**: `https://pulse-guard-simulator.vercel.app/?view=site`
* **Control Dashboard**: [https://pulse-guard-simulator.vercel.app/](https://pulse-guard-simulator.vercel.app/) or [https://pulse-guard-simulator.vercel.app/control](https://pulse-guard-simulator.vercel.app/control)

### 2. Recommended Test Configuration in PulseGuard
To test instant detection and recovery without waiting:
1. Open the PulseGuard dashboard at `http://localhost:3000` and click **"+ Add Website"**.
2. Configure with the following settings:
   - **Website Name:** `PulseGuard Sandbox`
   - **Base URL:** `https://pulse-guard-simulator.vercel.app/?view=site`
   - **Check Interval:** `1 minute`
   - **Consecutive Threshold (Frequency):** `1` *(triggers alert on the very first failure)*
   - **Pages to Monitor:**
     - `/` (Homepage)
     - `/wp-login.php` (Login)
     - `/wp-json/` (REST API)
   - **Notification Channels:** Check Telegram, Email, and/or WhatsApp.
3. Click **"Save Website"**.

### 3. Simulating Outages & Scenarios
Open the [Simulator Control Dashboard](https://pulse-guard-simulator.vercel.app/control) and switch between test modes with one click:

| Mode | What It Simulates | Expected Result in PulseGuard |
|------|-------------------|--------------------------------|
| 🟢 **Normal / Healthy** | Clean HTTP 200 OK | Status: **HEALTHY**, recovers site and sends recovery alert |
| 🟡 **Hostinger Coming Soon** | HTTP 200 with Hostinger placeholder | Flags soft failure / deep content detection |
| 🔴 **HTTP 500 Server Error** | PHP crash / Server Error | Status: **DOWN**, triggers instant outage notification |
| 💥 **Database Error** | "Error establishing database connection" | Status: **DOWN**, logs database connection failure |
| ⏳ **Timeout (10s)** | Connection hangs for 10 seconds | Status: **DOWN**, logs timeout failure |
| 🚫 **HTTP 404 Not Found** | Missing subpage / broken link | Flags affected page, tracks consecutive failure |

> **Tip:** Click the **"Check Now"** button on the PulseGuard dashboard to run an immediate inspection cycle instead of waiting for the 1-minute schedule!

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
