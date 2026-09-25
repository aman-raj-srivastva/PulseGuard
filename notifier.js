const https = require('https');
const nodemailer = require('nodemailer');
const storage = require('./storage');

function postJson(hostname, path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      family: 4, // Guarantee IPv4 routing to prevent Linux IPv6 timeouts
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ ok: false, description: `HTTP ${res.statusCode}: ${body}` });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timed out to Telegram API'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

class Notifier {
  constructor() {}

  // 1. Telegram Dispatcher (Rock-Solid IPv4)
  async sendTelegram(message, customSettings = null) {
    const settings = customSettings || storage.getSettings().telegram;
    if (!settings || !settings.botToken || !settings.chatId) {
      throw new Error('Telegram Bot Token or Chat ID is missing');
    }

    const path = `/bot${settings.botToken}/sendMessage`;
    const payload = {
      chat_id: settings.chatId,
      text: message,
      parse_mode: 'HTML'
    };

    let data = await postJson('api.telegram.org', path, payload);

    // Auto-handle supergroup migration
    if (!data.ok && data.parameters && data.parameters.migrate_to_chat_id) {
      const newChatId = data.parameters.migrate_to_chat_id;
      console.log(`[TELEGRAM] Group upgraded to supergroup. Migrating Chat ID: ${settings.chatId} -> ${newChatId}`);

      if (!customSettings) {
        const currentSettings = storage.getSettings();
        if (currentSettings.telegram) {
          currentSettings.telegram.chatId = String(newChatId);
          storage.saveSettings(currentSettings);
        }
      }

      payload.chat_id = newChatId;
      data = await postJson('api.telegram.org', path, payload);
      if (data.ok) {
        data.migratedChatId = newChatId;
        return data;
      }
    }

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }
    return data;
  }

  // 2. Email Dispatcher
  async sendEmail(subject, htmlBody, customSettings = null) {
    const settings = customSettings || storage.getSettings().email;
    if (!settings || !settings.smtpHost || !settings.toEmail) {
      throw new Error('Email SMTP configuration or Recipient Email is missing');
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort) || 587,
      secure: settings.secure === true || parseInt(settings.smtpPort) === 465,
      auth: (settings.user && settings.pass) ? {
        user: settings.user,
        pass: settings.pass
      } : undefined,
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: settings.fromEmail || `Site Monitor <${settings.user || 'monitor@localhost'}>`,
      to: settings.toEmail,
      subject: subject,
      html: htmlBody
    });

    return info;
  }

  // 3. WhatsApp Dispatcher (CallMeBot or Custom Webhook)
  async sendWhatsApp(message, customSettings = null) {
    const settings = customSettings || storage.getSettings().whatsapp;
    if (!settings) {
      throw new Error('WhatsApp settings are missing');
    }

    if (settings.provider === 'callmebot') {
      if (!settings.phone || !settings.apiKey) {
        throw new Error('CallMeBot Phone Number or API Key is missing');
      }
      const encodedMsg = encodeURIComponent(message);
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(settings.phone)}&text=${encodedMsg}&apikey=${encodeURIComponent(settings.apiKey)}`;

      const response = await fetch(url);
      const text = await response.text();
      return { success: true, response: text };
    } else if (settings.provider === 'webhook') {
      if (!settings.webhookUrl) {
        throw new Error('WhatsApp Webhook URL is missing');
      }
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          phone: settings.phone,
          timestamp: new Date().toISOString()
        })
      });
      return { success: response.ok, status: response.status };
    } else {
      throw new Error(`Unsupported WhatsApp provider: ${settings.provider}`);
    }
  }

  // Broadcast Alert to all active channels for a site
  async dispatchAlert(site, eventType, details) {
    const globalSettings = storage.getSettings();
    const channels = site.channels || { telegram: true, email: true, whatsapp: true };
    const timestamp = new Date().toLocaleString();

    let tgMsg = '';
    let emailSubject = '';
    let emailHtml = '';
    let waMsg = '';

    if (eventType === 'DOWN') {
      emailSubject = `🚨 [ALERT] ${site.name} is DOWN (${details.consecutiveFailures} Consecutive Failures)`;
      
      tgMsg = `🚨 <b>SITE DOWN ALERT</b>\n\n` +
              `🏢 <b>Site:</b> ${site.name}\n` +
              `🌐 <b>Base URL:</b> ${site.baseUrl}\n` +
              `❌ <b>Consecutive Failures:</b> ${details.consecutiveFailures} / ${site.consecutiveThreshold || 3}\n` +
              `⏰ <b>Time:</b> ${timestamp}\n\n` +
              `<b>Failing Pages / Issues:</b>\n` +
              details.failingPages.map(p => `• <code>${p.path}</code>: HTTP ${p.statusCode || 'ERR'} (${p.error || 'Connection Failed'})`).join('\n') +
              `\n\n⚡ <i>Autonomous Site Monitor</i>`;

      waMsg = `🚨 *SITE DOWN ALERT*\n\n` +
              `Site: ${site.name}\n` +
              `URL: ${site.baseUrl}\n` +
              `Consecutive Failures: ${details.consecutiveFailures}\n` +
              `Time: ${timestamp}\n\n` +
              `Failing:\n` +
              details.failingPages.map(p => `- ${p.path}: ${p.statusCode || 'ERR'} (${p.error || 'Failed'})`).join('\n');

      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #dc2626;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: #ffffff;">🚨 SITE DOWN ALERT</h2>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 16px; margin-top: 0;">Your monitored website has failed health checks:</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 8px; color: #94a3b8;">Website:</td><td style="padding: 8px; font-weight: bold;">${site.name}</td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Base URL:</td><td style="padding: 8px;"><a href="${site.baseUrl}" style="color: #38bdf8;">${site.baseUrl}</a></td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Consecutive Failures:</td><td style="padding: 8px; color: #f87171; font-weight: bold;">${details.consecutiveFailures}</td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Detected At:</td><td style="padding: 8px;">${timestamp}</td></tr>
            </table>

            <h4 style="color: #f87171; margin-bottom: 8px;">Failing Pages Details:</h4>
            <div style="background: #1e293b; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px;">
              ${details.failingPages.map(p => `<div style="padding: 4px 0; border-bottom: 1px solid #334155;"><b>${p.name || p.path}</b> (<a href="${site.baseUrl}${p.path}" style="color:#38bdf8;">${p.path}</a>): <span style="color:#ef4444;">${p.statusCode || 'ERR'}</span> - ${p.error || 'Connection Failed'} (${p.latencyMs}ms)</div>`).join('')}
            </div>

            <p style="margin-top: 24px; font-size: 12px; color: #64748b; text-align: center;">Autonomous Website Health Monitor • Localhost Engine</p>
          </div>
        </div>
      `;
    } else if (eventType === 'RECOVERED') {
      emailSubject = `✅ [RECOVERED] ${site.name} is BACK ONLINE`;

      tgMsg = `✅ <b>SITE RECOVERED / BACK ONLINE</b>\n\n` +
              `🏢 <b>Site:</b> ${site.name}\n` +
              `🌐 <b>Base URL:</b> ${site.baseUrl}\n` +
              `⏱️ <b>Downtime Duration:</b> ${details.durationText || 'N/A'}\n` +
              `⏰ <b>Recovered At:</b> ${timestamp}\n\n` +
              `All monitored pages are responding with HTTP 200 OK! 🎉`;

      waMsg = `✅ *SITE RECOVERED / BACK ONLINE*\n\n` +
              `Site: ${site.name}\n` +
              `URL: ${site.baseUrl}\n` +
              `Downtime Duration: ${details.durationText || 'N/A'}\n` +
              `Recovered At: ${timestamp}\n\n` +
              `All monitored pages are back up!`;

      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #16a34a;">
          <div style="background: #16a34a; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: #ffffff;">✅ SITE BACK ONLINE</h2>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 16px; margin-top: 0;">Great news! <b>${site.name}</b> has passed all health checks and is operating normally.</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 8px; color: #94a3b8;">Website:</td><td style="padding: 8px; font-weight: bold;">${site.name}</td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Base URL:</td><td style="padding: 8px;"><a href="${site.baseUrl}" style="color: #38bdf8;">${site.baseUrl}</a></td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Total Downtime:</td><td style="padding: 8px; color: #4ade80; font-weight: bold;">${details.durationText || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; color: #94a3b8;">Recovered At:</td><td style="padding: 8px;">${timestamp}</td></tr>
            </table>
            <p style="margin-top: 24px; font-size: 12px; color: #64748b; text-align: center;">Autonomous Website Health Monitor • Localhost Engine</p>
          </div>
        </div>
      `;
    }

    const results = { telegram: null, email: null, whatsapp: null };

    // Send Telegram
    if (channels.telegram && globalSettings.telegram.enabled) {
      try {
        await this.sendTelegram(tgMsg);
        results.telegram = { success: true };
        console.log(`[ALERT] Telegram notification sent for ${site.name}`);
      } catch (err) {
        console.error(`[ALERT ERROR] Telegram failed for ${site.name}:`, err.message);
        results.telegram = { success: false, error: err.message };
      }
    }

    // Send Email
    if (channels.email && globalSettings.email.enabled) {
      try {
        await this.sendEmail(emailSubject, emailHtml);
        results.email = { success: true };
        console.log(`[ALERT] Email notification sent for ${site.name}`);
      } catch (err) {
        console.error(`[ALERT ERROR] Email failed for ${site.name}:`, err.message);
        results.email = { success: false, error: err.message };
      }
    }

    // Send WhatsApp
    if (channels.whatsapp && globalSettings.whatsapp.enabled) {
      try {
        await this.sendWhatsApp(waMsg);
        results.whatsapp = { success: true };
        console.log(`[ALERT] WhatsApp notification sent for ${site.name}`);
      } catch (err) {
        console.error(`[ALERT ERROR] WhatsApp failed for ${site.name}:`, err.message);
        results.whatsapp = { success: false, error: err.message };
      }
    }

    return results;
  }
}

module.exports = new Notifier();
