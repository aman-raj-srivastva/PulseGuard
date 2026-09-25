const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const storage = require('./storage');
const notifier = require('./notifier');

class Checker extends EventEmitter {
  constructor() {
    super();
    this.isChecking = false;
    this.timer = null;
  }

  // Single page checker with precise latency and error details
  async checkUrl(fullUrl, timeoutSeconds = 10) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    return new Promise((resolve) => {
      try {
        const urlObj = new URL(fullUrl);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'GET',
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Autonomous-Site-Monitor/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          rejectUnauthorized: false // Allow self-signed or internal VPN certificates
        };

        const req = client.request(options, (res) => {
          const latencyMs = Date.now() - startTime;
          const statusCode = res.statusCode;
          let isSuccess = statusCode >= 200 && statusCode < 400;
          let bodyChunks = [];
          let totalBytes = 0;

          res.on('data', (chunk) => {
            if (totalBytes < 65536) { // Read first 64KB for content inspection
              bodyChunks.push(chunk);
              totalBytes += chunk.length;
            }
          });

          res.on('end', () => {
            const bodyText = Buffer.concat(bodyChunks).toString('utf8');
            let detectedIssue = null;

            // 1. Detect Hostinger / WordPress "Coming Soon" or Maintenance Mode
            if (
              bodyText.includes('<title>Coming Soon</title>') ||
              bodyText.includes('New WordPress website is being built and will be published soon') ||
              bodyText.includes('Briefly unavailable for scheduled maintenance') ||
              /hostinger.*coming soon/i.test(bodyText) ||
              bodyText.includes('Website Under Maintenance') ||
              bodyText.includes('Website is under construction')
            ) {
              isSuccess = false;
              detectedIssue = '"Coming Soon" / Maintenance Mode';
            }
            // 2. Detect WordPress Database / Critical PHP Errors
            else if (
              bodyText.includes('Error establishing a database connection') ||
              bodyText.includes('There has been a critical error on this website') ||
              bodyText.includes('Fatal error:') ||
              bodyText.includes('Parse error:')
            ) {
              isSuccess = false;
              detectedIssue = 'WordPress Critical Error / Database Connection Failure';
            }
            // 3. Detect Cloudflare Bot Challenge Interception
            else if (
              res.headers['cf-mitigated'] === 'challenge' ||
              (statusCode === 403 && bodyText.includes('challenges.cloudflare.com')) ||
              (statusCode === 403 && bodyText.includes('Performing security verification'))
            ) {
              isSuccess = false;
              detectedIssue = 'Cloudflare Anti-Bot Challenge Active (WAF Intercept)';
            }

            resolve({
              ok: isSuccess,
              statusCode: statusCode,
              statusText: res.statusMessage || '',
              latencyMs: latencyMs,
              error: isSuccess ? null : (detectedIssue || `HTTP Error ${statusCode} (${res.statusMessage || 'Server Error'})`),
              headers: res.headers,
              checkedAt: new Date().toISOString()
            });
          });
        });

        req.on('timeout', () => {
          req.destroy();
          const latencyMs = Date.now() - startTime;
          resolve({
            ok: false,
            statusCode: null,
            latencyMs: latencyMs,
            error: `Connection Timed Out (> ${timeoutSeconds}s)`,
            checkedAt: new Date().toISOString()
          });
        });

        req.on('error', (err) => {
          const latencyMs = Date.now() - startTime;
          resolve({
            ok: false,
            statusCode: null,
            latencyMs: latencyMs,
            error: err.code ? `${err.code}: ${err.message}` : err.message,
            checkedAt: new Date().toISOString()
          });
        });

        req.end();
      } catch (err) {
        resolve({
          ok: false,
          statusCode: null,
          latencyMs: 0,
          error: `Invalid URL: ${err.message}`,
          checkedAt: new Date().toISOString()
        });
      }
    });
  }

  // Check an entire site (checks all its defined subpages)
  async checkSite(site) {
    if (!site.enabled) {
      return { siteId: site.id, skipped: true };
    }

    const pages = site.pages && site.pages.length > 0
      ? site.pages
      : [{ id: 'p1', path: '/', name: 'Homepage' }];

    const pageResults = [];
    let failingPages = [];
    let totalLatency = 0;

    for (const page of pages) {
      const fullUrl = (site.baseUrl.replace(/\/+$/, '') + '/' + page.path.replace(/^\/+/, '')).replace(/\/+$/, '') || site.baseUrl;
      const res = await this.checkUrl(fullUrl, site.timeoutSeconds || 10);
      
      const pageStat = {
        id: page.id,
        name: page.name || page.path,
        path: page.path,
        fullUrl: fullUrl,
        ok: res.ok,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        error: res.error,
        checkedAt: res.checkedAt
      };

      pageResults.push(pageStat);
      totalLatency += res.latencyMs;

      if (!res.ok) {
        failingPages.push(pageStat);
      }

      // Record to log history
      const logEntry = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        siteId: site.id,
        siteName: site.name,
        pageName: pageStat.name,
        path: pageStat.path,
        url: fullUrl,
        status: res.ok ? 'UP' : 'DOWN',
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        error: res.error,
        timestamp: res.checkedAt
      };
      storage.addLog(logEntry);
      this.emit('log', logEntry);
    }

    const avgLatency = Math.round(totalLatency / pages.length);
    const isSiteHealthy = failingPages.length === 0;
    const previousStatus = site.status || 'UNKNOWN';
    const threshold = site.consecutiveThreshold || storage.getSettings().globalConsecutiveThreshold || 3;

    let consecutiveFailures = site.consecutiveFailures || 0;
    let newStatus = isSiteHealthy ? 'UP' : 'DOWN';

    if (!isSiteHealthy) {
      consecutiveFailures += 1;
      console.warn(`[MONITOR] ${site.name} failed check (${consecutiveFailures}/${threshold}). Failing pages: ${failingPages.map(p => p.path).join(', ')}`);
      
      // If threshold reached, trigger Alert
      if (consecutiveFailures === threshold) {
        console.error(`🚨 [ALERT TRIGGERED] ${site.name} reached ${threshold} consecutive failures! Dispatching notifications...`);
        
        // Log incident
        const inc = {
          id: 'inc-' + Date.now(),
          siteId: site.id,
          siteName: site.name,
          baseUrl: site.baseUrl,
          startedAt: new Date().toISOString(),
          resolvedAt: null,
          failingPages: failingPages.map(p => ({ path: p.path, error: p.error, statusCode: p.statusCode }))
        };
        storage.addIncident(inc);
        this.emit('incident', inc);

        // Dispatch alerts across selected channels
        await notifier.dispatchAlert(site, 'DOWN', {
          consecutiveFailures,
          failingPages
        });
      }
    } else {
      // Site is UP
      if (previousStatus === 'DOWN' && consecutiveFailures >= threshold) {
        console.log(`✅ [RECOVERY] ${site.name} has recovered and is now UP! Sending recovery notification...`);
        const now = new Date().toISOString();
        const resolvedInc = storage.resolveIncident(site.id, now);
        if (resolvedInc) {
          this.emit('incident', resolvedInc);
        }
        
        // Send recovery alert
        await notifier.dispatchAlert(site, 'RECOVERED', {
          durationText: 'Recovered automatically'
        });
      }
      consecutiveFailures = 0;
    }

    // Update site stats in storage
    const updatedSite = storage.updateSiteStatus(site.id, {
      status: newStatus,
      consecutiveFailures: consecutiveFailures,
      lastChecked: new Date().toISOString(),
      lastLatencyMs: avgLatency,
      pageStats: pageResults.reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
    });

    const resultPayload = {
      siteId: site.id,
      name: site.name,
      status: newStatus,
      avgLatency,
      lastChecked: updatedSite.lastChecked,
      failingPages,
      pages: pageResults,
      pageStats: updatedSite.pageStats,
      consecutiveFailures: updatedSite.consecutiveFailures
    };

    this.emit('check_complete', updatedSite);

    return resultPayload;
  }

  // Run a complete check sweep across all sites
  async checkAllSites() {
    if (this.isChecking) {
      console.log('[MONITOR] Check already in progress, skipping concurrent cycle.');
      return;
    }

    this.isChecking = true;
    console.log(`[MONITOR] Starting autonomous check cycle at ${new Date().toLocaleTimeString()}...`);

    const sites = storage.getSites();
    const results = [];

    for (const site of sites) {
      if (site.enabled !== false) {
        try {
          const res = await this.checkSite(site);
          results.push(res);
        } catch (err) {
          console.error(`[MONITOR ERROR] Failed to check site ${site.name}:`, err);
        }
      }
    }

    this.isChecking = false;
    console.log(`[MONITOR] Finished check cycle for ${results.length} sites.`);
    return results;
  }

  // Start autonomous background scheduler with per-site interval precision
  startScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log('[MONITOR] Autonomous background scheduler active (Tick: 15s, precision per-site intervals).');

    // Run initial sweep immediately after start
    setTimeout(() => {
      this.checkAllSites();
    }, 2000);

    // Continuous tick loop every 15 seconds
    this.timer = setInterval(async () => {
      if (this.isChecking) return;

      const sites = storage.getSites();
      const now = Date.now();

      for (const site of sites) {
        if (site.enabled === false) continue;

        const intervalMins = site.intervalMinutes || 5;
        const intervalMs = intervalMins * 60 * 1000;
        const lastCheckedMs = site.lastChecked ? new Date(site.lastChecked).getTime() : 0;

        // If site has never been checked or its interval has elapsed, check it
        if (!site.lastChecked || (now - lastCheckedMs) >= intervalMs) {
          try {
            await this.checkSite(site);
          } catch (err) {
            console.error(`[AUTONOMOUS SCHEDULER] Error checking ${site.name}:`, err.message);
          }
        }
      }
    }, 15000);
  }

  restartScheduler() {
    this.startScheduler();
  }
}

module.exports = new Checker();
