// PulseGuard Ultra-Dynamic Real-Time Frontend Controller (SSE Stream + Live Polling)

let sitesData = [];
let logsData = [];
let incidentsData = [];
let currentFilter = { siteId: '', status: '', search: '' };
let activeTab = 'sites';
let refreshTimer = null;
let sseConnection = null;
let isUpdating = false;

document.addEventListener('DOMContentLoaded', () => {
  setupAuthEvents();
  checkAuthAndInit();
});

// === AUTHENTICATION WRAPPER ===

function getToken() {
  return localStorage.getItem('pulseguard_token');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('pulseguard_token', token);
  } else {
    localStorage.removeItem('pulseguard_token');
  }
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !url.includes('/api/auth/login')) {
    setToken(null);
    showLoginScreen();
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashboardApp').style.display = 'none';
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
}

function showDashboard(username = 'admin') {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboardApp').style.display = 'block';
  document.getElementById('navUsername').innerText = username;

  // Start Real-Time SSE Stream & 3s Polling Heartbeat
  initEventStream();
  if (!refreshTimer) {
    refreshTimer = setInterval(liveUpdateCycle, 3000);
  }
}

async function checkAuthAndInit() {
  const token = getToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await apiFetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      showDashboard(data.user?.username || 'admin');
      await initDashboard();
      setupEventListeners();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    showLoginScreen();
  }
}

function setupAuthEvents() {
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userInp = document.getElementById('loginUsername').value.trim();
    const passInp = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');
    const btnSubmit = document.getElementById('btnLoginSubmit');

    errDiv.style.display = 'none';
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userInp, password: passInp })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToken(data.token);
        showDashboard(data.user?.username || userInp);
        await initDashboard();
        setupEventListeners();
        showToast(`Welcome back, ${data.user?.username || 'admin'}!`, 'success');
      } else {
        errDiv.querySelector('span').innerText = data.error || 'Invalid credentials';
        errDiv.style.display = 'flex';
      }
    } catch (err) {
      errDiv.querySelector('span').innerText = 'Connection error: ' + err.message;
      errDiv.style.display = 'flex';
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login to Dashboard';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    setToken(null);
    showLoginScreen();
    showToast('Logged out successfully', 'info');
  });

  document.getElementById('btnChangePassword').addEventListener('click', async () => {
    const currentPassword = document.getElementById('authCurrPass').value;
    const newUsername = document.getElementById('authNewUser').value.trim();
    const newPassword = document.getElementById('authNewPass').value;

    if (!currentPassword || !newPassword) {
      showToast('Please enter both current and new password', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newUsername, newPassword })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Credentials updated successfully!', 'success');
        document.getElementById('authCurrPass').value = '';
        document.getElementById('authNewPass').value = '';
        if (data.username) {
          document.getElementById('navUsername').innerText = data.username;
        }
      } else {
        showToast(data.error || 'Failed to change password', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// === REAL-TIME SERVER-SENT EVENTS (SSE) STREAM ===

function initEventStream() {
  if (sseConnection) {
    sseConnection.close();
  }

  const token = getToken();
  if (!token) return;

  try {
    sseConnection = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

    sseConnection.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleServerEvent(msg);
      } catch (err) {
        console.error('SSE JSON error:', err);
      }
    };

    sseConnection.onerror = () => {
      // Reconnect automatically handled by EventSource
      console.warn('SSE connection interrupted, maintaining polling fallback...');
    };
  } catch (err) {
    console.error('SSE initialization failed:', err);
  }
}

function handleServerEvent(msg) {
  const { type, data } = msg;

  if (type === 'site_updated') {
    const idx = sitesData.findIndex(s => s.id === data.id);
    if (idx >= 0) {
      sitesData[idx] = data;
    } else {
      sitesData.unshift(data);
    }
    renderSites();
    fetchStats();
  } else if (type === 'site_created') {
    const idx = sitesData.findIndex(s => s.id === data.id);
    if (idx < 0) sitesData.unshift(data);
    renderSites();
    updateSiteSelectFilters();
    fetchStats();
  } else if (type === 'site_deleted') {
    sitesData = sitesData.filter(s => s.id !== data.id);
    renderSites();
    updateSiteSelectFilters();
    fetchStats();
  } else if (type === 'log_added') {
    // Add new log to top
    logsData.unshift(data);
    if (logsData.length > 200) logsData.pop();
    
    // Update badge
    const badge = document.getElementById('badgeLogCount');
    if (badge) badge.innerText = parseInt(badge.innerText || '0') + 1;

    // If on logs tab, update table dynamically with highlight
    if (activeTab === 'logs') {
      prependLogRow(data);
    }
  } else if (type === 'logs_cleared') {
    logsData = [];
    renderLogs();
    fetchStats();
  } else if (type === 'incident_updated') {
    fetchIncidents();
    fetchStats();
  } else if (type === 'settings_updated') {
    fetchSettings();
  }
}

// === DASHBOARD INITIALIZATION & LIVE CYCLE ===

async function initDashboard() {
  await Promise.all([
    fetchStats(),
    fetchSites(),
    fetchLogs(),
    fetchIncidents(),
    fetchSettings()
  ]);
}

async function liveUpdateCycle() {
  if (isUpdating) return;
  isUpdating = true;

  try {
    await Promise.all([
      fetchStats(),
      fetchSites(true),
      activeTab === 'logs' ? fetchLogs(true) : null,
      activeTab === 'incidents' ? fetchIncidents(true) : null
    ]);
  } catch (err) {
    console.warn('Live poll error:', err);
  } finally {
    isUpdating = false;
  }
}

// === API CALLS ===

async function fetchStats() {
  try {
    const res = await apiFetch('/api/stats');
    const data = await res.json();
    
    document.getElementById('statUptime').innerText = `${data.uptimePercent}%`;
    document.getElementById('statTotalSites').innerText = data.totalSites;
    document.getElementById('statTotalPages').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${data.totalPages} subpages checked`;
    document.getElementById('statAvgLatency').innerText = data.avgLatency > 0 ? `${data.avgLatency} ms` : '-- ms';
    document.getElementById('statIncidents').innerText = data.activeIncidents;
    document.getElementById('badgeSiteCount').innerText = data.totalSites;
    document.getElementById('badgeLogCount').innerText = data.totalLogs;
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function fetchSites(isBackground = false) {
  try {
    const res = await apiFetch('/api/sites');
    sitesData = await res.json();
    renderSites();
    updateSiteSelectFilters();
  } catch (err) {
    console.error('Error fetching sites:', err);
  }
}

async function fetchLogs(isBackground = false) {
  try {
    const query = new URLSearchParams(currentFilter).toString();
    const res = await apiFetch(`/api/logs?${query}`);
    logsData = await res.json();
    renderLogs();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

async function fetchIncidents(isBackground = false) {
  try {
    const res = await apiFetch('/api/incidents');
    incidentsData = await res.json();
    renderIncidents();
  } catch (err) {
    console.error('Error fetching incidents:', err);
  }
}

async function fetchSettings() {
  try {
    const res = await apiFetch('/api/settings');
    const s = await res.json();
    
    // Telegram
    document.getElementById('settTgEnabled').checked = s.telegram?.enabled || false;
    document.getElementById('settTgToken').value = s.telegram?.botToken || '';
    document.getElementById('settTgChatId').value = s.telegram?.chatId || '';

    // Email
    document.getElementById('settEmailEnabled').checked = s.email?.enabled || false;
    document.getElementById('settSmtpHost').value = s.email?.smtpHost || '';
    document.getElementById('settSmtpPort').value = s.email?.smtpPort || 587;
    document.getElementById('settSmtpSecure').value = s.email?.secure ? 'true' : 'false';
    document.getElementById('settSmtpUser').value = s.email?.user || '';
    document.getElementById('settSmtpPass').value = s.email?.pass || '';
    document.getElementById('settEmailTo').value = s.email?.toEmail || '';

    // WhatsApp
    document.getElementById('settWaEnabled').checked = s.whatsapp?.enabled || false;
    document.getElementById('settWaProvider').value = s.whatsapp?.provider || 'callmebot';
    document.getElementById('settWaPhone').value = s.whatsapp?.phone || '';
    document.getElementById('settWaApiKey').value = s.whatsapp?.apiKey || '';
    document.getElementById('settWaWebhookUrl').value = s.whatsapp?.webhookUrl || '';
    
    toggleWaProvider(s.whatsapp?.provider || 'callmebot');
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

// === LIVE REACTIVE RENDERING ===

function renderSites() {
  const container = document.getElementById('sitesContainer');
  if (!sitesData || sitesData.length === 0) {
    container.innerHTML = `
      <div class="card-glass p-4 text-center" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-globe fa-3x text-muted mb-2"></i>
        <h3>No websites configured yet</h3>
        <p class="text-muted">Click "+ Add Website" to start monitoring your web properties.</p>
      </div>
    `;
    return;
  }

  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  const filtered = sitesData.filter(s => 
    s.name.toLowerCase().includes(query) || s.baseUrl.toLowerCase().includes(query)
  );

  container.innerHTML = filtered.map(site => {
    const isChecking = site._checking === true;
    const statusClass = isChecking ? 'unknown' : (site.status === 'UP' ? 'up' : (site.status === 'DOWN' ? 'down' : 'unknown'));
    const statusLabel = isChecking ? 'Checking...' : (site.status === 'UP' ? 'Online' : (site.status === 'DOWN' ? 'Down' : 'Checking'));
    const latencyText = site.lastLatencyMs ? `${site.lastLatencyMs} ms` : '--';
    const lastCheckText = site.lastChecked ? new Date(site.lastChecked).toLocaleTimeString() : 'Pending';

    // Subpages list
    const pagesHtml = (site.pages || []).map(p => {
      const pStat = (site.pageStats && site.pageStats[p.id]) || {};
      const pStatusClass = pStat.ok ? 'text-emerald' : (pStat.ok === false ? 'text-rose' : 'text-muted');
      const pCodeBadge = pStat.statusCode ? `<span class="badge ${pStat.ok ? 'bg-emerald' : 'bg-rose'}">${pStat.statusCode}</span>` : `<span class="badge">--</span>`;
      const pLatency = pStat.latencyMs ? `${pStat.latencyMs}ms` : '--';
      const pErrorHint = pStat.error ? `<div class="text-rose" style="font-size:10px;margin-top:2px;">${escapeHtml(pStat.error)}</div>` : '';

      return `
        <div class="subpage-item">
          <div>
            <span class="subpage-path">
              <i class="fa-solid fa-circle ${pStatusClass}" style="font-size: 8px;"></i>
              <strong>${escapeHtml(p.name || p.path)}</strong>
              <span class="text-muted" style="font-size: 11px;">(${escapeHtml(p.path)})</span>
            </span>
            ${pErrorHint}
          </div>
          <div class="subpage-meta">
            ${pCodeBadge}
            <span class="text-muted" style="font-size: 11px;">${pLatency}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="site-card" id="card-${site.id}">
        <div class="site-card-header">
          <div class="site-title-group">
            <h3>${escapeHtml(site.name)}</h3>
            <a href="${escapeHtml(site.baseUrl)}" target="_blank" class="site-url-link">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(site.baseUrl)}
            </a>
          </div>
          <div class="status-pill ${statusClass}">
            <span class="pulse-dot" style="background:${site.status === 'UP' ? 'var(--color-emerald)' : 'var(--color-rose)'}"></span>
            ${statusLabel}
          </div>
        </div>

        <div class="site-metrics-row">
          <div class="metric-col">
            <span>Latency</span>
            <strong class="${site.status === 'UP' ? 'text-emerald' : (site.status === 'DOWN' ? 'text-rose' : '')}">${latencyText}</strong>
          </div>
          <div class="metric-col">
            <span>Interval</span>
            <strong>${site.intervalMinutes || 5}m</strong>
          </div>
          <div class="metric-col">
            <span>Last Check</span>
            <strong style="font-size: 12px;">${lastCheckText}</strong>
          </div>
        </div>

        <!-- Subpages Drawer -->
        <div class="subpages-box">
          <div class="subpages-header">
            <span><i class="fa-solid fa-layer-group"></i> Monitored Pages (${(site.pages || []).length})</span>
            <span class="text-muted" style="font-size: 11px;">Threshold: ${site.consecutiveThreshold || 3}x</span>
          </div>
          <div class="subpages-content">
            ${pagesHtml}
          </div>
        </div>

        <div class="site-actions">
          <div class="channel-badges">
            ${site.channels?.telegram ? '<i class="fa-brands fa-telegram text-blue" title="Telegram Enabled"></i> ' : ''}
            ${site.channels?.email ? '<i class="fa-solid fa-envelope text-amber" title="Email Enabled"></i> ' : ''}
            ${site.channels?.whatsapp ? '<i class="fa-brands fa-whatsapp text-emerald" title="WhatsApp Enabled"></i>' : ''}
          </div>
          <div class="action-buttons">
            <button class="btn btn-xs btn-outline" id="btnCheck-${site.id}" onclick="triggerCheckSite('${site.id}')" title="Check this site now">
              <i class="fa-solid fa-rotate ${isChecking ? 'fa-spin' : ''}"></i> Check Now
            </button>
            <button class="btn btn-xs btn-outline" onclick="openEditSiteModal('${site.id}')" title="Edit website settings">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-xs btn-danger-outline" onclick="deleteSite('${site.id}')" title="Remove website">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderLogs() {
  const tbody = document.getElementById('logsTableBody');
  if (!logsData || logsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">No inspection logs available yet. Checks will populate here automatically.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logsData.slice(0, 100).map(log => buildLogRowHtml(log)).join('');
}

function buildLogRowHtml(log, isNew = false) {
  const isUp = log.status === 'UP';
  const statusBadge = isUp
    ? `<span class="badge bg-emerald" style="background:rgba(16,185,129,0.2);color:var(--color-emerald);font-weight:600;"><i class="fa-solid fa-check"></i> UP</span>`
    : `<span class="badge bg-rose" style="background:rgba(244,63,94,0.2);color:var(--color-rose);font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> DOWN</span>`;

  const codeBadge = log.statusCode
    ? `<span class="badge" style="font-family:'JetBrains Mono';">${log.statusCode}</span>`
    : `<span class="badge text-rose">ERR</span>`;

  const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const highlightClass = isNew ? 'class="row-highlight"' : '';

  return `
    <tr ${highlightClass}>
      <td style="color:var(--text-secondary);font-size:12px;">${timeStr}</td>
      <td><strong>${escapeHtml(log.siteName || 'Unknown')}</strong></td>
      <td><code style="color:var(--color-blue);">${escapeHtml(log.path || '/')}</code></td>
      <td>${codeBadge}</td>
      <td>${log.latencyMs ? `${log.latencyMs} ms` : '--'}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:${isUp ? 'var(--text-muted)' : 'var(--color-rose)'};font-weight:${isUp ? 'normal' : '600'};">
        ${escapeHtml(log.error || 'Responding 200 OK')}
      </td>
    </tr>
  `;
}

function prependLogRow(log) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  // Check if matches current filters
  if (currentFilter.siteId && log.siteId !== currentFilter.siteId) return;
  if (currentFilter.status && log.status !== currentFilter.status) return;
  if (currentFilter.search) {
    const q = currentFilter.search.toLowerCase();
    if (!((log.siteName || '').toLowerCase().includes(q) || (log.path || '').toLowerCase().includes(q))) {
      return;
    }
  }

  // Remove empty placeholder if present
  if (tbody.querySelector('td[colspan]')) {
    tbody.innerHTML = '';
  }

  const tr = document.createElement('tr');
  tr.className = 'row-highlight';
  tr.innerHTML = `
    <td style="color:var(--text-secondary);font-size:12px;">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
    <td><strong>${escapeHtml(log.siteName || 'Unknown')}</strong></td>
    <td><code style="color:var(--color-blue);">${escapeHtml(log.path || '/')}</code></td>
    <td>${log.statusCode ? `<span class="badge" style="font-family:'JetBrains Mono';">${log.statusCode}</span>` : `<span class="badge text-rose">ERR</span>`}</td>
    <td>${log.latencyMs ? `${log.latencyMs} ms` : '--'}</td>
    <td>${log.status === 'UP' ? `<span class="badge bg-emerald" style="background:rgba(16,185,129,0.2);color:var(--color-emerald);font-weight:600;"><i class="fa-solid fa-check"></i> UP</span>` : `<span class="badge bg-rose" style="background:rgba(244,63,94,0.2);color:var(--color-rose);font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> DOWN</span>`}</td>
    <td style="font-size:12px;color:${log.status === 'UP' ? 'var(--text-muted)' : 'var(--color-rose)'};font-weight:${log.status === 'UP' ? 'normal' : '600'};">${escapeHtml(log.error || 'Responding 200 OK')}</td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  // Keep max 100 rows in DOM
  if (tbody.children.length > 100) {
    tbody.removeChild(tbody.lastChild);
  }
}

function renderIncidents() {
  const container = document.getElementById('incidentsContainer');
  if (!incidentsData || incidentsData.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="fa-solid fa-shield-halved fa-2x text-emerald mb-2"></i>
        <p>No outages recorded! All monitored websites are operating smoothly.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = incidentsData.map(inc => {
    const isResolved = !!inc.resolvedAt;
    const startStr = new Date(inc.startedAt).toLocaleString();
    const durationText = inc.durationSeconds ? `${Math.round(inc.durationSeconds / 60)} minutes` : (isResolved ? 'Recovered' : 'Active Outage');

    return `
      <div class="incident-item ${isResolved ? 'resolved' : ''}">
        <div>
          <h4 style="font-size:15px;margin-bottom:4px;">
            <i class="fa-solid ${isResolved ? 'fa-circle-check text-emerald' : 'fa-triangle-exclamation text-rose'}"></i>
            ${escapeHtml(inc.siteName)} - ${isResolved ? 'Incident Resolved' : 'Active Outage'}
          </h4>
          <p style="font-size:12px;color:var(--text-secondary);">
            Started: ${startStr} • Duration: <strong class="${isResolved ? 'text-emerald' : 'text-rose'}">${durationText}</strong>
          </p>
        </div>
        <div>
          <span class="badge ${isResolved ? 'bg-emerald' : 'bg-rose'}" style="padding:6px 12px;font-size:12px;">
            ${isResolved ? 'Recovered' : 'Investigating'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function updateSiteSelectFilters() {
  const select = document.getElementById('logFilterSite');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = `<option value="">All Websites (${sitesData.length})</option>` +
    sitesData.map(s => `<option value="${s.id}" ${s.id === currentVal ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}

// === EVENT LISTENERS & MODAL HANDLERS ===

let eventsBound = false;
function setupEventListeners() {
  if (eventsBound) return;
  eventsBound = true;

  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      const tabId = `tab-${activeTab}`;
      document.getElementById(tabId).classList.add('active');

      if (activeTab === 'logs') fetchLogs();
      if (activeTab === 'incidents') fetchIncidents();
    });
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', () => {
    currentFilter.search = document.getElementById('searchInput').value;
    renderSites();
    if (activeTab === 'logs') fetchLogs();
  });

  // Log filters
  document.getElementById('logFilterSite').addEventListener('change', (e) => {
    currentFilter.siteId = e.target.value;
    fetchLogs();
  });

  document.getElementById('logFilterStatus').addEventListener('change', (e) => {
    currentFilter.status = e.target.value;
    fetchLogs();
  });

  document.getElementById('btnRefreshLogs').addEventListener('click', () => {
    fetchLogs();
    showToast('Logs refreshed', 'info');
  });

  document.getElementById('btnClearLogs').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all monitoring logs?')) {
      await apiFetch('/api/logs', { method: 'DELETE' });
      logsData = [];
      renderLogs();
      fetchStats();
      showToast('All logs cleared', 'success');
    }
  });

  document.getElementById('btnExportLogs').addEventListener('click', exportLogsToCsv);

  // Check all button
  document.getElementById('btnCheckAll').addEventListener('click', async () => {
    const btn = document.getElementById('btnCheckAll');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Checking All...';
    showToast('Autonomous check started for all websites...', 'info');

    // Optimistically mark all sites as checking
    sitesData.forEach(s => s._checking = true);
    renderSites();

    try {
      await apiFetch('/api/check-all', { method: 'POST' });
      await fetchSites();
      await fetchStats();
      if (activeTab === 'logs') await fetchLogs();
      showToast('All websites checked successfully!', 'success');
    } catch (err) {
      showToast('Check failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Check All Now';
    }
  });

  // Modal open triggers
  document.getElementById('btnAddSite').addEventListener('click', openAddSiteModal);
  document.getElementById('btnOpenSettings').addEventListener('click', () => openModal('settingsModal'));

  // Add dynamic subpage row
  document.getElementById('btnAddPageRow').addEventListener('click', () => {
    addPageInputRow('', '');
  });

  // Site form submit
  document.getElementById('siteForm').addEventListener('submit', handleSiteFormSubmit);

  // Settings save submit
  document.getElementById('btnSaveSettings').addEventListener('click', handleSaveSettings);
}

// === DYNAMIC PAGES IN MODAL ===

function addPageInputRow(pathVal = '', nameVal = '') {
  const container = document.getElementById('pagesInputList');
  const rowId = 'p-row-' + Math.random().toString(36).substring(2, 7);
  
  const div = document.createElement('div');
  div.className = 'page-input-row';
  div.id = rowId;
  div.innerHTML = `
    <input type="text" class="form-input col-6 page-path-input" placeholder="e.g. /shop" value="${escapeHtml(pathVal)}" required>
    <input type="text" class="form-input col-6 page-name-input" placeholder="Label" value="${escapeHtml(nameVal)}">
    <button type="button" class="btn btn-xs btn-danger-outline" onclick="document.getElementById('${rowId}').remove()">&times;</button>
  `;
  container.appendChild(div);
}

function openAddSiteModal() {
  document.getElementById('modalSiteTitle').innerHTML = '<i class="fa-solid fa-globe"></i> Add Monitored Website';
  document.getElementById('siteId').value = '';
  document.getElementById('siteName').value = '';
  document.getElementById('siteBaseUrl').value = '';
  document.getElementById('siteInterval').value = '5';
  document.getElementById('siteThreshold').value = '3';
  document.getElementById('chanTelegram').checked = true;
  document.getElementById('chanEmail').checked = true;
  document.getElementById('chanWhatsapp').checked = true;

  const container = document.getElementById('pagesInputList');
  container.innerHTML = '';
  addPageInputRow('/', 'Homepage');
  addPageInputRow('/about/', 'About Us');
  addPageInputRow('/contact/', 'Contact Us');

  openModal('siteModal');
}

function openEditSiteModal(siteId) {
  const site = sitesData.find(s => s.id === siteId);
  if (!site) return;

  document.getElementById('modalSiteTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Monitored Website';
  document.getElementById('siteId').value = site.id;
  document.getElementById('siteName').value = site.name;
  document.getElementById('siteBaseUrl').value = site.baseUrl;
  document.getElementById('siteInterval').value = site.intervalMinutes || 5;
  document.getElementById('siteThreshold').value = site.consecutiveThreshold || 3;
  document.getElementById('chanTelegram').checked = site.channels?.telegram !== false;
  document.getElementById('chanEmail').checked = site.channels?.email !== false;
  document.getElementById('chanWhatsapp').checked = site.channels?.whatsapp !== false;

  const container = document.getElementById('pagesInputList');
  container.innerHTML = '';
  
  const pages = site.pages && site.pages.length > 0 ? site.pages : [{ path: '/', name: 'Homepage' }];
  pages.forEach(p => addPageInputRow(p.path, p.name));

  openModal('siteModal');
}

async function handleSiteFormSubmit(e) {
  e.preventDefault();
  
  const siteId = document.getElementById('siteId').value;
  const name = document.getElementById('siteName').value.trim();
  const baseUrl = document.getElementById('siteBaseUrl').value.trim();
  const intervalMinutes = parseInt(document.getElementById('siteInterval').value) || 5;
  const consecutiveThreshold = parseInt(document.getElementById('siteThreshold').value) || 3;

  const channels = {
    telegram: document.getElementById('chanTelegram').checked,
    email: document.getElementById('chanEmail').checked,
    whatsapp: document.getElementById('chanWhatsapp').checked
  };

  const pageRows = document.querySelectorAll('#pagesInputList .page-input-row');
  const pages = [];
  pageRows.forEach((row, idx) => {
    const path = row.querySelector('.page-path-input').value.trim();
    const pageName = row.querySelector('.page-name-input').value.trim() || path;
    if (path) {
      pages.push({ id: `p${idx + 1}`, path, name: pageName });
    }
  });

  const payload = {
    name,
    baseUrl,
    intervalMinutes,
    consecutiveThreshold,
    channels,
    pages
  };

  try {
    if (siteId) {
      const res = await apiFetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      const idx = sitesData.findIndex(s => s.id === siteId);
      if (idx >= 0) sitesData[idx] = updated;
      renderSites();
      showToast('Website updated successfully', 'success');
    } else {
      const res = await apiFetch('/api/sites', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const newSite = await res.json();
      sitesData.unshift(newSite);
      renderSites();
      showToast('Website added & instant check queued!', 'success');
    }

    closeModal('siteModal');
    await fetchStats();
  } catch (err) {
    showToast('Failed to save website: ' + err.message, 'error');
  }
}

async function deleteSite(siteId) {
  const site = sitesData.find(s => s.id === siteId);
  if (!confirm(`Are you sure you want to stop monitoring "${site?.name || 'this website'}"?`)) {
    return;
  }

  try {
    await apiFetch(`/api/sites/${siteId}`, { method: 'DELETE' });
    sitesData = sitesData.filter(s => s.id !== siteId);
    renderSites();
    showToast('Website removed from monitor', 'info');
    await fetchStats();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// Instant Single-Site Check with immediate in-place UI update
async function triggerCheckSite(siteId) {
  const site = sitesData.find(s => s.id === siteId);
  if (!site) return;

  site._checking = true;
  renderSites();
  showToast(`Checking ${site.name}...`, 'info');

  try {
    const res = await apiFetch(`/api/sites/${siteId}/check`, { method: 'POST' });
    const result = await res.json();

    // Update site locally
    site._checking = false;
    site.status = result.status;
    site.lastLatencyMs = result.avgLatency;
    site.lastChecked = result.lastChecked || new Date().toISOString();
    if (result.pages) {
      site.pageStats = result.pages.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
    }

    renderSites();
    await fetchStats();
    if (activeTab === 'logs') await fetchLogs();
    
    if (result.status === 'UP') {
      showToast(`✅ ${site.name} is ONLINE (${result.avgLatency}ms)`, 'success');
    } else {
      showToast(`🚨 ${site.name} check failed!`, 'error');
    }
  } catch (err) {
    site._checking = false;
    renderSites();
    showToast('Check error: ' + err.message, 'error');
  }
}

// === SETTINGS & ALERT TESTING ===

async function handleSaveSettings() {
  const settings = {
    telegram: {
      enabled: document.getElementById('settTgEnabled').checked,
      botToken: document.getElementById('settTgToken').value.trim(),
      chatId: document.getElementById('settTgChatId').value.trim()
    },
    email: {
      enabled: document.getElementById('settEmailEnabled').checked,
      smtpHost: document.getElementById('settSmtpHost').value.trim(),
      smtpPort: parseInt(document.getElementById('settSmtpPort').value) || 587,
      secure: document.getElementById('settSmtpSecure').value === 'true',
      user: document.getElementById('settSmtpUser').value.trim(),
      pass: document.getElementById('settSmtpPass').value.trim(),
      fromEmail: 'alerts@yourmonitor.local',
      toEmail: document.getElementById('settEmailTo').value.trim()
    },
    whatsapp: {
      enabled: document.getElementById('settWaEnabled').checked,
      provider: document.getElementById('settWaProvider').value,
      phone: document.getElementById('settWaPhone').value.trim(),
      apiKey: document.getElementById('settWaApiKey').value.trim(),
      webhookUrl: document.getElementById('settWaWebhookUrl').value.trim()
    }
  };

  try {
    await apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
    showToast('Notification settings saved successfully!', 'success');
    closeModal('settingsModal');
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

async function testChannel(channel) {
  showToast(`Sending test notification to ${channel.toUpperCase()}...`, 'info');
  
  let settings = {};
  if (channel === 'telegram') {
    settings = {
      botToken: document.getElementById('settTgToken').value.trim(),
      chatId: document.getElementById('settTgChatId').value.trim()
    };
  } else if (channel === 'email') {
    settings = {
      smtpHost: document.getElementById('settSmtpHost').value.trim(),
      smtpPort: parseInt(document.getElementById('settSmtpPort').value) || 587,
      secure: document.getElementById('settSmtpSecure').value === 'true',
      user: document.getElementById('settSmtpUser').value.trim(),
      pass: document.getElementById('settSmtpPass').value.trim(),
      toEmail: document.getElementById('settEmailTo').value.trim()
    };
  } else if (channel === 'whatsapp') {
    settings = {
      provider: document.getElementById('settWaProvider').value,
      phone: document.getElementById('settWaPhone').value.trim(),
      apiKey: document.getElementById('settWaApiKey').value.trim(),
      webhookUrl: document.getElementById('settWaWebhookUrl').value.trim()
    };
  }

  try {
    const res = await apiFetch('/api/test-notification', {
      method: 'POST',
      body: JSON.stringify({ channel, settings })
    });
    const data = await res.json();
    if (data.success) {
      if (data.newChatId) {
        document.getElementById('settTgChatId').value = data.newChatId;
      }
      showToast(`✅ ${data.message}`, 'success');
    } else {
      showToast(`❌ Test failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`❌ Network error: ${err.message}`, 'error');
  }
}

function toggleWaProvider(provider) {
  const apiKeyGroup = document.getElementById('waApiKeyGroup');
  const webhookGroup = document.getElementById('waWebhookGroup');
  const phoneGroup = document.getElementById('waPhoneGroup');

  if (provider === 'callmebot') {
    apiKeyGroup.style.display = 'block';
    phoneGroup.style.display = 'block';
    webhookGroup.style.display = 'none';
  } else {
    apiKeyGroup.style.display = 'none';
    webhookGroup.style.display = 'block';
  }
}

function exportLogsToCsv() {
  if (!logsData || logsData.length === 0) {
    showToast('No logs to export', 'error');
    return;
  }

  const headers = ['Timestamp', 'Site Name', 'Route', 'Full URL', 'Status', 'HTTP Code', 'Latency (ms)', 'Error Details'];
  const rows = logsData.map(l => [
    `"${new Date(l.timestamp).toISOString()}"`,
    `"${(l.siteName || '').replace(/"/g, '""')}"`,
    `"${(l.path || '').replace(/"/g, '""')}"`,
    `"${(l.url || '').replace(/"/g, '""')}"`,
    `"${l.status}"`,
    `"${l.statusCode || ''}"`,
    `"${l.latencyMs || ''}"`,
    `"${(l.error || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `monitor_logs_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Logs exported to CSV file', 'success');
}

// === UTILITIES ===

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald' : (type === 'error' ? 'fa-circle-xmark text-rose' : 'fa-circle-info text-blue')}"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
