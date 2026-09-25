const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const storage = require('./storage');
const checker = require('./checker');
const notifier = require('./notifier');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// === REAL-TIME SSE BROADCASTER ===
const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Connect checker events to SSE broadcaster
checker.on('check_complete', (updatedSite) => {
  broadcastEvent('site_updated', updatedSite);
});

checker.on('log', (logEntry) => {
  broadcastEvent('log_added', logEntry);
});

checker.on('incident', (incident) => {
  broadcastEvent('incident_updated', incident);
});

// === AUTHENTICATION SYSTEM ===
// In-memory active sessions (token -> { username, createdAt, expiresAt })
const activeSessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth Middleware to protect API routes
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const session = activeSessions.get(token);
  // Extend session expiry on activity (30 days)
  session.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  req.user = session;
  next();
}

// Real-time Event Stream (Server-Sent Events)
app.get('/api/events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const client = { res, user: req.user };
  sseClients.add(client);

  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
  });
});

// 0. Auth Endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const currentAuth = storage.getAuth();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username === currentAuth.username && password === currentAuth.password) {
    const token = generateToken();
    activeSessions.set(token, {
      username: currentAuth.username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      user: { username: currentAuth.username }
    });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ authenticated: true, user: { username: req.user.username } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const currentAuth = storage.getAuth();

  if (currentPassword !== currentAuth.password) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const updatedAuth = storage.saveAuth({
    username: newUsername && newUsername.trim() ? newUsername.trim() : currentAuth.username,
    password: newPassword
  });

  res.json({ success: true, message: 'Credentials updated successfully', username: updatedAuth.username });
});

// === PROTECTED API ROUTES ===

// 1. Stats Summary
app.get('/api/stats', requireAuth, (req, res) => {
  const sites = storage.getSites();
  const logs = storage.getLogs({ limit: 1000 });
  const incidents = storage.getIncidents();

  const totalSites = sites.length;
  const activeSites = sites.filter(s => s.enabled !== false).length;
  const upSites = sites.filter(s => s.enabled !== false && s.status === 'UP').length;
  const downSites = sites.filter(s => s.enabled !== false && s.status === 'DOWN').length;
  const unknownSites = activeSites - upSites - downSites;

  const totalPages = sites.reduce((sum, s) => sum + (s.pages ? s.pages.length : 1), 0);

  const okLogs = logs.filter(l => l.status === 'UP' && l.latencyMs > 0);
  const avgLatency = okLogs.length > 0
    ? Math.round(okLogs.reduce((sum, l) => sum + l.latencyMs, 0) / okLogs.length)
    : 0;

  const totalLogsCount = logs.length;
  const successfulLogsCount = logs.filter(l => l.status === 'UP').length;
  const uptimePercent = totalLogsCount > 0
    ? ((successfulLogsCount / totalLogsCount) * 100).toFixed(1)
    : 100;

  res.json({
    totalSites,
    activeSites,
    upSites,
    downSites,
    unknownSites,
    totalPages,
    avgLatency,
    uptimePercent,
    totalLogs: logs.length,
    activeIncidents: incidents.filter(i => !i.resolvedAt).length
  });
});

// 2. Sites Management
app.get('/api/sites', requireAuth, (req, res) => {
  res.json(storage.getSites());
});

app.post('/api/sites', requireAuth, async (req, res) => {
  try {
    const {
      name,
      baseUrl,
      intervalMinutes = 5,
      consecutiveThreshold = 3,
      timeoutSeconds = 10,
      channels = { telegram: true, email: true, whatsapp: true },
      pages = []
    } = req.body;

    if (!name || !baseUrl) {
      return res.status(400).json({ error: 'Site name and Base URL are required' });
    }

    let finalPages = pages && pages.length > 0 ? pages : [];
    if (finalPages.length === 0) {
      finalPages = [
        { id: 'p1', path: '/', name: 'Homepage' },
        { id: 'p2', path: '/about/', name: 'About' },
        { id: 'p3', path: '/contact/', name: 'Contact' }
      ];
    }

    const newSite = {
      id: 'site-' + Date.now(),
      name,
      baseUrl: baseUrl.trim(),
      intervalMinutes: parseInt(intervalMinutes) || 5,
      consecutiveThreshold: parseInt(consecutiveThreshold) || 3,
      timeoutSeconds: parseInt(timeoutSeconds) || 10,
      enabled: true,
      channels,
      pages: finalPages.map((p, idx) => ({
        id: p.id || `p${idx + 1}`,
        path: p.path.startsWith('/') ? p.path : `/${p.path}`,
        name: p.name || p.path
      })),
      status: 'UNKNOWN',
      consecutiveFailures: 0,
      lastChecked: null,
      lastLatencyMs: null,
      pageStats: {}
    };

    storage.saveSite(newSite);
    broadcastEvent('site_created', newSite);
    checker.checkSite(newSite).catch(console.error);

    res.status(201).json(newSite);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sites/:id', requireAuth, (req, res) => {
  try {
    const site = storage.getSite(req.params.id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const updated = storage.saveSite({
      ...site,
      ...req.body,
      id: site.id
    });

    broadcastEvent('site_updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sites/:id', requireAuth, (req, res) => {
  storage.deleteSite(req.params.id);
  broadcastEvent('site_deleted', { id: req.params.id });
  res.json({ success: true, id: req.params.id });
});

// 3. Manual Check Triggers
app.post('/api/sites/:id/check', requireAuth, async (req, res) => {
  const site = storage.getSite(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  try {
    const result = await checker.checkSite(site);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/check-all', requireAuth, async (req, res) => {
  try {
    const results = await checker.checkAllSites();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Logs API
app.get('/api/logs', requireAuth, (req, res) => {
  const logs = storage.getLogs(req.query);
  res.json(logs);
});

app.delete('/api/logs', requireAuth, (req, res) => {
  storage.clearLogs();
  broadcastEvent('logs_cleared', {});
  res.json({ success: true, message: 'All logs cleared' });
});

// 5. Incidents API
app.get('/api/incidents', requireAuth, (req, res) => {
  res.json(storage.getIncidents());
});

// 6. Settings API
app.get('/api/settings', requireAuth, (req, res) => {
  res.json(storage.getSettings());
});

app.post('/api/settings', requireAuth, (req, res) => {
  try {
    const updated = storage.saveSettings(req.body);
    checker.restartScheduler();
    broadcastEvent('settings_updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Notification Testing Endpoint
app.post('/api/test-notification', requireAuth, async (req, res) => {
  const { channel, settings } = req.body;
  const testMsg = `🔔 <b>Test Notification from Autonomous Site Monitor</b>\n\n` +
                  `✅ Your ${channel.toUpperCase()} notification channel is configured properly and working!`;

  try {
    if (channel === 'telegram') {
      const tgResult = await notifier.sendTelegram(testMsg, settings);
      const extra = tgResult.migratedChatId ? ` (Supergroup ID detected: ${tgResult.migratedChatId} — please save this in Telegram Chat ID)` : '';
      res.json({ success: true, message: `Telegram test message sent successfully!${extra}`, newChatId: tgResult.migratedChatId });
    } else if (channel === 'email') {
      await notifier.sendEmail(
        '🔔 Site Monitor Test Email',
        `<div style="font-family:sans-serif;padding:20px;background:#0f172a;color:#fff;border-radius:8px;">` +
        `<h2 style="color:#38bdf8;">🔔 Test Notification</h2>` +
        `<p>Your SMTP email configuration is working perfectly!</p>` +
        `</div>`,
        settings
      );
      res.json({ success: true, message: 'Test email sent successfully!' });
    } else if (channel === 'whatsapp') {
      await notifier.sendWhatsApp(
        `🔔 *Site Monitor Test Notification*\n\nYour WhatsApp alert channel is working properly!`,
        settings
      );
      res.json({ success: true, message: 'WhatsApp test notification sent successfully!' });
    } else {
      res.status(400).json({ error: `Unknown channel: ${channel}` });
    }
  } catch (err) {
    console.error(`[TEST NOTIFICATION ERROR] ${channel}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start background autonomous checker
checker.startScheduler();

// Start server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PulseGuard Site Monitor running on port ${PORT}`);
  console.log(`🔐 Authentication Protected`);
  console.log(`======================================================\n`);
});
