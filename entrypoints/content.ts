// Content script - injects badge UI on GitHub PR pages

import type { MessageResponse, CachedContributor, PRContext } from '../lib/types';
import { BADGE_ID } from '../lib/constants';

export default defineContentScript({
  matches: ['*://github.com/*'],
  runAt: 'document_idle',

  main(ctx) {
    let lastUrl = location.href;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const tryInjectBadge = () => {
      if (ctx.isInvalid) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (ctx.isInvalid) return;
        if (isPRPage() && !document.getElementById(BADGE_ID)) {
          injectBadge(ctx);
        }
      }, 100);
    };

    // Initial injection
    if (isPRPage()) {
      injectBadge(ctx);
    }

    // Poll for URL changes (most reliable for GitHub's pjax/turbo)
    const pollInterval = setInterval(() => {
      if (ctx.isInvalid) {
        clearInterval(pollInterval);
        return;
      }
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        tryInjectBadge();
      }
    }, 300);

    ctx.onInvalidated(() => clearInterval(pollInterval));

    // Handle SPA navigation (WXT built-in)
    ctx.addEventListener(window, 'wxt:locationchange', tryInjectBadge);

    // GitHub uses Turbo for navigation
    ctx.addEventListener(document as unknown as Window, 'turbo:load', tryInjectBadge);
    ctx.addEventListener(document as unknown as Window, 'turbo:render', tryInjectBadge);

    // Also listen for pjax (older GitHub navigation)
    ctx.addEventListener(document as unknown as Window, 'pjax:end', tryInjectBadge);

    // Fallback: MutationObserver to catch DOM updates after navigation
    const observer = new MutationObserver(() => {
      if (ctx.isInvalid) return;
      if (isPRPage() && !document.getElementById(BADGE_ID)) {
        const authorElement = findAuthorElement();
        if (authorElement) {
          tryInjectBadge();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  },
});

function isPRPage(): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(window.location.href);
}

function extractPRContext(): PRContext | null {
  const match = window.location.pathname.match(/\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      prNumber: parseInt(match[3], 10),
    };
  }
  return null;
}

async function injectBadge(ctx: { isInvalid: boolean }, retryCount = 0): Promise<void> {
  if (ctx.isInvalid) return;

  const existingBadge = document.getElementById(BADGE_ID);
  if (existingBadge) existingBadge.remove();

  const authorElement = findAuthorElement();
  if (!authorElement) {
    // Retry up to 10 times with 200ms delay (2 seconds total)
    if (retryCount < 10) {
      setTimeout(() => {
        if (!ctx.isInvalid && isPRPage() && !document.getElementById(BADGE_ID)) {
          injectBadge(ctx, retryCount + 1);
        }
      }, 200);
    }
    return;
  }

  const username = extractUsername(authorElement);
  if (!username) return;

  const prContext = extractPRContext();

  const badge = createBadgeElement();
  badge.innerHTML = '<span style="color: #656d76;">Loading...</span>';
  authorElement.parentElement?.insertBefore(badge, authorElement.nextSibling);

  try {
    if (ctx.isInvalid) return;

    const response = await browser.runtime.sendMessage({
      type: 'GET_CONTRIBUTOR_STATS',
      payload: { username, prContext },
    }) as MessageResponse;

    if (ctx.isInvalid) return;

    if (response.success) {
      badge.innerHTML = createBadgeHTML(response.data, username);
      attachEventHandlers(badge, username, prContext);
    } else {
      badge.innerHTML = createErrorHTML(response.error, response.code);
    }
  } catch (error) {
    if (ctx.isInvalid) return;
    badge.innerHTML = createErrorHTML('Failed to load', 'API_ERROR');
  }
}

function findAuthorElement(): Element | null {
  const selectors = [
    '.gh-header-meta .author',
    '[data-hovercard-type="user"].author',
    '.timeline-comment-header .author',
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function extractUsername(element: Element): string | null {
  const href = element.getAttribute('href');
  if (href) {
    const match = href.match(/\/([^/]+)$/);
    if (match) return match[1];
  }
  return element.textContent?.trim() || null;
}

function createBadgeElement(): HTMLDivElement {
  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bgColor-muted, #f6f8fa);
    border: 1px solid var(--borderColor-default, #d0d7de);
    vertical-align: middle;
    position: relative;
  `;
  return badge;
}

function getVerdict(score: number, hasEnoughData: boolean): { label: string; color: string; bg: string } {
  if (!hasEnoughData) {
    return { label: 'New Contributor', color: '#656d76', bg: '#656d7615' };
  }
  if (score >= 70) {
    return { label: 'Likely Safe', color: '#1a7f37', bg: '#1a7f3715' };
  }
  if (score >= 45) {
    return { label: 'Review Carefully', color: '#9a6700', bg: '#9a670015' };
  }
  return { label: 'Caution', color: '#cf222e', bg: '#cf222e15' };
}

function createBadgeHTML(cached: CachedContributor, username: string): string {
  const { data, score } = cached;
  const { global } = data;

  const hasEnoughData = global.closedPRs >= 3;
  const verdict = getVerdict(score.numericScore, hasEnoughData);

  return `
    <span style="font-size: 14px;">${score.emoji}</span>
    <span style="
      color: ${verdict.color};
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      background: ${verdict.bg};
      font-size: 11px;
    ">${verdict.label}</span>
    <span class="slopscore-info" style="color: #656d76; cursor: help; font-size: 13px; margin-left: 2px;"
      data-cached='${JSON.stringify(cached).replace(/'/g, "&#39;")}'
    >&#9432;</span>
    <button data-slopscore-refresh="${username}" style="
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 4px;
      color: #656d76;
      font-size: 12px;
      opacity: 0.6;
      margin-left: -2px;
    " title="Refresh">&#8635;</button>
    <div class="slopscore-tooltip" style="
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      padding: 16px;
      background: var(--bgColor-default, #ffffff);
      border: 1px solid var(--borderColor-default, #d0d7de);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
      z-index: 1000;
      min-width: 300px;
      max-width: 360px;
      max-height: 400px;
      overflow-y: auto;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fgColor-default, #24292f);
    "></div>
  `;
}

function createTooltipContent(cached: CachedContributor): string {
  const { data, score } = cached;
  const { global, repoHistory } = data;
  const { breakdown } = score;

  const hasEnoughData = global.closedPRs >= 3;
  const verdict = getVerdict(score.numericScore, hasEnoughData);

  // Format account age nicely
  const formatAge = (days: number): string => {
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    const years = Math.round(days / 365 * 10) / 10;
    return years === 1 ? '1 year' : `${years} years`;
  };

  // Header with verdict
  const header = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--borderColor-default, #d8dee4);">
      <span style="font-size: 20px;">${score.emoji}</span>
      <div>
        <div style="font-weight: 600; font-size: 14px; color: ${verdict.color};">${verdict.label}</div>
        <div style="color: var(--fgColor-muted, #656d76); font-size: 11px;">Score: ${score.numericScore}/100</div>
      </div>
    </div>
  `;

  // Signals section (the main content)
  const positiveSignals = breakdown.positiveSignals.map(s =>
    `<div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px;">
      <span style="color: #3fb950;">✓</span>
      <span style="color: var(--fgColor-default, #24292f); font-size: 12px;">${s}</span>
    </div>`
  ).join('');

  const negativeSignals = breakdown.negativeSignals.map(s =>
    `<div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px;">
      <span style="color: #f85149;">✗</span>
      <span style="color: var(--fgColor-default, #24292f); font-size: 12px;">${s}</span>
    </div>`
  ).join('');

  const neutralSignals = breakdown.neutralNotes.map(s =>
    `<div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px;">
      <span style="color: var(--fgColor-muted, #656d76);">○</span>
      <span style="color: var(--fgColor-muted, #656d76); font-size: 12px;">${s}</span>
    </div>`
  ).join('');

  const signalsSection = (positiveSignals || negativeSignals || neutralSignals) ? `
    <div style="margin-bottom: 12px;">
      ${negativeSignals}
      ${positiveSignals}
      ${neutralSignals}
    </div>
  ` : '<div style="color: var(--fgColor-muted, #656d76); margin-bottom: 12px;">No significant signals</div>';

  // Quick stats row
  const quickStats = `
    <div style="display: flex; gap: 12px; padding: 8px 0; border-top: 1px solid var(--borderColor-default, #d8dee4); border-bottom: 1px solid var(--borderColor-default, #d8dee4); margin-bottom: 8px;">
      <div style="text-align: center;">
        <div style="font-weight: 600; font-size: 13px; color: var(--fgColor-default, #24292f);">${global.totalPRs}</div>
        <div style="color: var(--fgColor-muted, #656d76); font-size: 10px;">PRs</div>
      </div>
      <div style="text-align: center;">
        <div style="font-weight: 600; font-size: 13px; color: var(--fgColor-default, #24292f);">${global.closedPRs > 0 ? Math.round(global.mergedPRs / global.closedPRs * 100) : 0}%</div>
        <div style="color: var(--fgColor-muted, #656d76); font-size: 10px;">Merged</div>
      </div>
      <div style="text-align: center;">
        <div style="font-weight: 600; font-size: 13px; color: var(--fgColor-default, #24292f);">${global.reposCount}</div>
        <div style="color: var(--fgColor-muted, #656d76); font-size: 10px;">Repos</div>
      </div>
      <div style="text-align: center;">
        <div style="font-weight: 600; font-size: 13px; color: var(--fgColor-default, #24292f);">${formatAge(global.accountAgeDays)}</div>
        <div style="color: var(--fgColor-muted, #656d76); font-size: 10px;">Account</div>
      </div>
      ${repoHistory ? `
        <div style="text-align: center;">
          <div style="font-weight: 600; font-size: 13px; color: var(--fgColor-default, #24292f);">${repoHistory.previousMergedPRs}</div>
          <div style="color: var(--fgColor-muted, #656d76); font-size: 10px;">Here</div>
        </div>
      ` : ''}
    </div>
  `;

  // Collapsible detailed breakdown
  const detailedBreakdown = `
    <details style="margin-top: 4px;">
      <summary style="cursor: pointer; color: var(--fgColor-muted, #656d76); font-size: 11px; user-select: none;">
        View detailed breakdown
      </summary>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--borderColor-default, #d8dee4); color: var(--fgColor-default, #24292f);">
        <div style="margin-bottom: 10px;">
          <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; color: var(--fgColor-muted, #656d76);">SCORE COMPONENTS</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            <div>Merge Rate: <b>${breakdown.components.mergeRateScore}</b></div>
            <div>Repo Quality: <b>${breakdown.components.repoQualityScore}</b></div>
            <div>Trust: <b>${breakdown.components.trustScore}</b></div>
            <div>Account: <b>${breakdown.components.accountScore}</b></div>
            ${repoHistory ? `<div>Repo History: <b>${breakdown.components.repoHistoryScore}</b></div>` : ''}
          </div>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; color: var(--fgColor-muted, #656d76);">PR BREAKDOWN (180 days)</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            <div>Public: ${global.prBreakdown.publicPRs}</div>
            <div>Private: ${global.prBreakdown.privatePRs}</div>
            <div>Own repos: ${global.prBreakdown.ownRepoPRs}</div>
            <div>External: ${global.prBreakdown.externalRepoPRs}</div>
            <div>Popular repos: ${global.prBreakdown.popularRepoPRs}</div>
            <div>Small repos: ${global.prBreakdown.smallRepoPRs}</div>
          </div>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; color: var(--fgColor-muted, #656d76);">MERGE CONTEXT</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            <div>Self-merge (own): ${global.mergeBreakdown.selfMergeOwnRepo}</div>
            <div>Self-merge (ext): ${global.mergeBreakdown.selfMergeExternalRepo}</div>
            <div>By others (own): ${global.mergeBreakdown.mergedByOthersOwnRepo}</div>
            <div>By others (ext): ${global.mergeBreakdown.mergedByOthersExternalRepo}</div>
          </div>
          <div style="font-size: 11px; color: var(--fgColor-muted, #656d76); margin-top: 4px;">
            Unique mergers: ${global.mergeBreakdown.uniqueMergers.length}
          </div>
        </div>
        ${repoHistory ? `
          <div>
            <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; color: var(--fgColor-muted, #656d76);">THIS REPO</div>
            <div style="font-size: 11px;">
              ${repoHistory.repoFullName} (${repoHistory.repoStars.toLocaleString()} ★)<br>
              ${repoHistory.previousMergedPRs} merged, ${repoHistory.previousClosedPRs} closed, ${repoHistory.issuesOpened} issues
            </div>
          </div>
        ` : ''}
      </div>
    </details>
  `;

  return `${header}${signalsSection}${quickStats}${detailedBreakdown}`;
}

function createErrorHTML(error: string, code: string): string {
  if (code === 'NO_TOKEN') {
    return '<span style="color: #cf222e;">Token required - Click extension icon</span>';
  }
  if (code === 'RATE_LIMITED') {
    return '<span style="color: #cf222e;">Rate limited - Try later</span>';
  }
  return `<span style="color: #cf222e;">${error}</span>`;
}

function attachEventHandlers(badge: HTMLElement, username: string, prContext: PRContext | null): void {
  // Refresh button
  const refreshBtn = badge.querySelector(`[data-slopscore-refresh="${username}"]`);
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      badge.innerHTML = '<span style="color: #656d76;">Refreshing...</span>';

      try {
        const response = await browser.runtime.sendMessage({
          type: 'REFRESH_STATS',
          payload: { username, prContext },
        }) as MessageResponse;

        if (response.success) {
          badge.innerHTML = createBadgeHTML(response.data, username);
          attachEventHandlers(badge, username, prContext);
        } else {
          badge.innerHTML = createErrorHTML(response.error, response.code);
        }
      } catch {
        badge.innerHTML = createErrorHTML('Refresh failed', 'API_ERROR');
      }
    });
  }

  // Tooltip handlers
  const infoIcon = badge.querySelector('.slopscore-info') as HTMLElement | null;
  const tooltip = badge.querySelector('.slopscore-tooltip') as HTMLElement | null;

  if (tooltip && infoIcon) {
    let hideTimeout: number;
    let isTooltipHovered = false;

    const showTooltip = () => {
      clearTimeout(hideTimeout);
      try {
        const cachedStr = infoIcon.getAttribute('data-cached') || '{}';
        const cached = JSON.parse(cachedStr.replace(/&#39;/g, "'"));
        tooltip.innerHTML = createTooltipContent(cached);
        tooltip.style.display = 'block';
      } catch (e) {
        tooltip.innerHTML = '<div style="color: #cf222e;">Error loading details</div>';
        tooltip.style.display = 'block';
      }
    };

    const hideTooltip = () => {
      hideTimeout = window.setTimeout(() => {
        if (!isTooltipHovered) {
          tooltip.style.display = 'none';
        }
      }, 300);
    };

    infoIcon.addEventListener('mouseenter', showTooltip);
    infoIcon.addEventListener('mouseleave', hideTooltip);

    tooltip.addEventListener('mouseenter', () => {
      isTooltipHovered = true;
      clearTimeout(hideTimeout);
    });

    tooltip.addEventListener('mouseleave', () => {
      isTooltipHovered = false;
      hideTooltip();
    });

    // Keep tooltip open while scrolling inside it
    tooltip.addEventListener('scroll', () => {
      clearTimeout(hideTimeout);
    });
  }
}
