import './style.css';

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}

interface AppState {
  token: string;
  isConnected: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  rateLimit: RateLimitInfo | null;
  rateLimitLoading: boolean;
}

const state: AppState = {
  token: '',
  isConnected: false,
  message: null,
  rateLimit: null,
  rateLimitLoading: false,
};

async function init() {
  // Check if token exists
  const token = await browser.runtime.sendMessage({ type: 'GET_TOKEN' }) as string | null;
  state.isConnected = !!token;
  state.token = token || '';
  render();

  // Fetch rate limit if connected
  if (state.isConnected) {
    fetchRateLimitInfo();
  }
}

async function fetchRateLimitInfo() {
  state.rateLimitLoading = true;
  render();

  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_RATE_LIMIT' }) as { success: boolean; data?: RateLimitInfo };
    if (response?.success && response.data) {
      state.rateLimit = response.data;
    }
  } catch (error) {
    console.error('[SlopScore] Failed to fetch rate limit:', error);
  }

  state.rateLimitLoading = false;
  render();
}

function formatTimeUntilReset(resetAt: string): string {
  const resetTime = new Date(resetAt).getTime();
  const now = Date.now();
  const diffMs = resetTime - now;

  if (diffMs <= 0) return 'now';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getRateLimitStatus(remaining: number, limit: number): { color: string; bg: string } {
  const percentage = remaining / limit;
  if (percentage > 0.5) return { color: '#1a7f37', bg: '#dafbe1' };
  if (percentage > 0.2) return { color: '#9a6700', bg: '#fff8c5' };
  return { color: '#cf222e', bg: '#ffebe9' };
}

function renderRateLimit(): string {
  if (state.rateLimitLoading) {
    return `
      <div class="rate-limit loading">
        <span class="rate-limit-label">API Rate Limit</span>
        <span class="rate-limit-value">Loading...</span>
      </div>
    `;
  }

  if (!state.rateLimit) {
    return '';
  }

  const { remaining, limit, resetAt } = state.rateLimit;
  const { color, bg } = getRateLimitStatus(remaining, limit);
  const timeUntilReset = formatTimeUntilReset(resetAt);

  return `
    <div class="rate-limit" style="background: ${bg}; color: ${color};">
      <div class="rate-limit-header">
        <span class="rate-limit-label">API Rate Limit</span>
        <span class="rate-limit-reset">Resets in ${timeUntilReset}</span>
      </div>
      <div class="rate-limit-bar-container">
        <div class="rate-limit-bar" style="width: ${(remaining / limit) * 100}%; background: ${color};"></div>
      </div>
      <span class="rate-limit-value">${remaining.toLocaleString()} / ${limit.toLocaleString()} remaining</span>
    </div>
  `;
}

function render() {
  const app = document.querySelector<HTMLDivElement>('#app')!;

  app.innerHTML = `
    <div class="header">
      <span style="font-size: 20px;">&#128201;</span>
      <h1>SlopScore</h1>
    </div>

    <div class="status ${state.isConnected ? 'connected' : 'disconnected'}">
      <span class="status-dot"></span>
      <span>${state.isConnected ? 'Connected to GitHub' : 'Not connected'}</span>
    </div>

    ${state.isConnected ? renderRateLimit() : ''}

    <div class="form-group">
      <label for="token">GitHub Personal Access Token</label>
      <p class="help-text">
        Create a token with <strong>public_repo</strong> scope for higher rate limits.
      </p>
      <input
        type="password"
        id="token"
        placeholder="ghp_xxxxxxxxxxxx"
        value="${state.token}"
      />
    </div>

    <div class="button-group">
      <button class="primary" id="save-btn" ${!state.token ? 'disabled' : ''}>
        Save Token
      </button>
      <button class="secondary" id="clear-btn" ${!state.isConnected ? 'disabled' : ''}>
        Clear Token
      </button>
    </div>

    ${state.isConnected ? `
      <button class="text-btn" id="clear-cache-btn">
        Clear cached data
      </button>
    ` : ''}

    ${state.message ? `
      <div class="message ${state.message.type}">
        ${state.message.text}
      </div>
    ` : ''}

    <a
      href="https://github.com/settings/tokens/new?scopes=public_repo&description=SlopScore"
      target="_blank"
      class="info-link"
    >
      Create a new GitHub token &#8599;
    </a>
  `;

  // Attach event listeners
  const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
  const saveBtn = document.querySelector<HTMLButtonElement>('#save-btn')!;
  const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
  const clearCacheBtn = document.querySelector<HTMLButtonElement>('#clear-cache-btn');

  tokenInput.addEventListener('input', (e) => {
    state.token = (e.target as HTMLInputElement).value;
    saveBtn.disabled = !state.token;
  });

  saveBtn.addEventListener('click', handleSave);
  clearBtn.addEventListener('click', handleClear);
  clearCacheBtn?.addEventListener('click', handleClearCache);
}

async function handleSave() {
  if (!state.token) return;

  try {
    // Validate token by making a test request
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${state.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      state.message = { type: 'error', text: 'Invalid token. Please check and try again.' };
      render();
      return;
    }

    // Save token
    await browser.runtime.sendMessage({
      type: 'SET_TOKEN',
      payload: { token: state.token },
    });

    state.isConnected = true;
    state.message = { type: 'success', text: 'Token saved successfully!' };
    render();

    // Fetch rate limit now that we're connected
    fetchRateLimitInfo();

    // Clear message after 3 seconds
    setTimeout(() => {
      state.message = null;
      render();
    }, 3000);
  } catch (error) {
    state.message = { type: 'error', text: 'Failed to validate token.' };
    render();
  }
}

async function handleClear() {
  await browser.runtime.sendMessage({ type: 'CLEAR_TOKEN' });
  state.token = '';
  state.isConnected = false;
  state.rateLimit = null;
  state.message = { type: 'success', text: 'Token cleared.' };
  render();

  setTimeout(() => {
    state.message = null;
    render();
  }, 3000);
}

async function handleClearCache() {
  await browser.runtime.sendMessage({ type: 'CLEAR_ALL_CACHE' });
  state.message = { type: 'success', text: 'Cache cleared! Refresh any PR page.' };
  render();

  setTimeout(() => {
    state.message = null;
    render();
  }, 3000);
}

// Initialize
init();
