const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SITES_FILE = path.join(DATA_DIR, 'sites.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const INCIDENTS_FILE = path.join(DATA_DIR, 'incidents.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_AUTH = {
  username: 'admin',
  password: 'AmanRaj'
};

// Initial seed sites based on user's portfolio
const DEFAULT_SITES = [
  {
    id: 'site-1',
    name: 'MindwaveDAO',
    baseUrl: 'http://192.168.133.220:8080',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-2',
    name: 'Nexus RWA',
    baseUrl: 'http://192.168.133.220:8081',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-3',
    name: 'MindWave Innovations',
    baseUrl: 'http://192.168.133.220:8082',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-4',
    name: 'Block Assure Inc',
    baseUrl: 'http://192.168.133.220:8083',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-5',
    name: 'Hibiscus Consultancy',
    baseUrl: 'http://192.168.133.220:8084',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-6',
    name: 'Voat AI',
    baseUrl: 'http://192.168.133.220:8085',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-7',
    name: 'Voat Coupon',
    baseUrl: 'http://192.168.133.220:8086',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-8',
    name: 'Darkviolet Crow / BCMGuru',
    baseUrl: 'http://192.168.133.220:8087',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  },
  {
    id: 'site-9',
    name: 'Wave Plus Global',
    baseUrl: 'http://192.168.133.220:8088',
    intervalMinutes: 5,
    consecutiveThreshold: 3,
    timeoutSeconds: 10,
    enabled: true,
    channels: { telegram: true, email: true, whatsapp: true },
    pages: [
      { id: 'p1', path: '/', name: 'Homepage' },
      { id: 'p2', path: '/wp-login.php', name: 'WP Login' },
      { id: 'p3', path: '/wp-json/', name: 'REST API' }
    ],
    status: 'UNKNOWN',
    consecutiveFailures: 0,
    lastChecked: null,
    uptimePercent: 100,
    pageStats: {}
  }
];

const DEFAULT_SETTINGS = {
  telegram: {
    enabled: false,
    botToken: '',
    chatId: ''
  },
  email: {
    enabled: false,
    smtpHost: '',
    smtpPort: 587,
    secure: false,
    user: '',
    pass: '',
    fromEmail: 'alerts@yourmonitor.local',
    toEmail: ''
  },
  whatsapp: {
    enabled: false,
    provider: 'callmebot', // 'callmebot' or 'webhook' or 'twilio'
    phone: '',
    apiKey: '',
    webhookUrl: ''
  },
  globalCheckIntervalMinutes: 5,
  globalConsecutiveThreshold: 3
};

function readJson(file, defaultVal) {
  try {
    if (!fs.existsSync(file)) {
      writeJson(file, defaultVal);
      return defaultVal;
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return defaultVal;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

class Storage {
  constructor() {
    this.sites = readJson(SITES_FILE, DEFAULT_SITES);
    this.logs = readJson(LOGS_FILE, []);
    this.settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    this.incidents = readJson(INCIDENTS_FILE, []);
    this.auth = readJson(AUTH_FILE, DEFAULT_AUTH);
  }

  // Sites
  getSites() {
    return this.sites;
  }

  getSite(id) {
    return this.sites.find(s => s.id === id);
  }

  saveSite(site) {
    const idx = this.sites.findIndex(s => s.id === site.id);
    if (idx >= 0) {
      this.sites[idx] = { ...this.sites[idx], ...site };
    } else {
      this.sites.push(site);
    }
    writeJson(SITES_FILE, this.sites);
    return site;
  }

  deleteSite(id) {
    this.sites = this.sites.filter(s => s.id !== id);
    writeJson(SITES_FILE, this.sites);
  }

  updateSiteStatus(id, updateData) {
    const site = this.getSite(id);
    if (!site) return null;
    Object.assign(site, updateData);
    writeJson(SITES_FILE, this.sites);
    return site;
  }

  // Logs (keep last 5000 entries max)
  addLog(log) {
    this.logs.unshift(log);
    if (this.logs.length > 5000) {
      this.logs = this.logs.slice(0, 5000);
    }
    writeJson(LOGS_FILE, this.logs);
  }

  getLogs(filter = {}) {
    let list = this.logs;
    if (filter.siteId) {
      list = list.filter(l => l.siteId === filter.siteId);
    }
    if (filter.status) {
      list = list.filter(l => l.status === filter.status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(l =>
        (l.siteName && l.siteName.toLowerCase().includes(q)) ||
        (l.url && l.url.toLowerCase().includes(q)) ||
        (l.pageName && l.pageName.toLowerCase().includes(q)) ||
        (l.error && l.error.toLowerCase().includes(q))
      );
    }
    const limit = filter.limit ? parseInt(filter.limit) : 200;
    return list.slice(0, limit);
  }

  clearLogs() {
    this.logs = [];
    writeJson(LOGS_FILE, this.logs);
  }

  // Incidents
  addIncident(incident) {
    this.incidents.unshift(incident);
    if (this.incidents.length > 500) {
      this.incidents = this.incidents.slice(0, 500);
    }
    writeJson(INCIDENTS_FILE, this.incidents);
  }

  getIncidents() {
    return this.incidents;
  }

  resolveIncident(siteId, recoveryTime) {
    const incident = this.incidents.find(i => i.siteId === siteId && !i.resolvedAt);
    if (incident) {
      incident.resolvedAt = recoveryTime;
      incident.durationSeconds = Math.round((new Date(recoveryTime) - new Date(incident.startedAt)) / 1000);
      writeJson(INCIDENTS_FILE, this.incidents);
    }
  }

  // Settings
  getSettings() {
    return this.settings;
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    writeJson(SETTINGS_FILE, this.settings);
    return this.settings;
  }

  // Auth Credentials
  getAuth() {
    return this.auth;
  }

  saveAuth(newAuth) {
    this.auth = { ...this.auth, ...newAuth };
    writeJson(AUTH_FILE, this.auth);
    return this.auth;
  }
}

module.exports = new Storage();
