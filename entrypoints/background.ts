// Background script - handles API calls and caching

import type {
  Message,
  GetStatsMessage,
  TokenMessage,
  MessageResponse,
  RateLimitMessageResponse,
  CachedContributor,
} from '../lib/types';
import { calculateScore } from '../lib/scoring';
import {
  getFromCache,
  saveToCache,
  isExpired,
  clearCache,
  clearAllCache,
  getToken,
  setToken,
  clearToken,
} from '../lib/cache';
import { fetchContributorData, fetchRepoHistory, fetchRateLimit } from '../lib/github-api';

export default defineBackground(() => {
  // Listen for messages from content script
  browser.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse: (response: MessageResponse | RateLimitMessageResponse | string | null) => void) => {
      handleMessage(message)
        .then(sendResponse)
        .catch((error) => {
          console.error('[SlopScore] Error handling message:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error',
            code: 'API_ERROR',
          });
        });

      // Return true to indicate we'll send response asynchronously
      return true;
    }
  );

  console.log('[SlopScore] Background script loaded');
});

async function handleMessage(message: Message): Promise<MessageResponse | RateLimitMessageResponse | string | null> {
  switch (message.type) {
    case 'GET_CONTRIBUTOR_STATS':
      return handleGetStats(message as GetStatsMessage, false);

    case 'REFRESH_STATS':
      return handleGetStats(message as GetStatsMessage, true);

    case 'GET_TOKEN':
      return getToken();

    case 'SET_TOKEN': {
      const tokenMsg = message as TokenMessage;
      await setToken(tokenMsg.payload.token);
      return null;
    }

    case 'CLEAR_TOKEN':
      await clearToken();
      return null;

    case 'CLEAR_ALL_CACHE':
      await clearAllCache();
      return null;

    case 'GET_RATE_LIMIT':
      return handleGetRateLimit();

    default:
      return { success: false, error: 'Unknown message type', code: 'API_ERROR' };
  }
}

async function handleGetStats(
  message: GetStatsMessage,
  forceRefresh: boolean
): Promise<MessageResponse> {
  const { username, prContext } = message.payload;

  // Check for token first
  const token = await getToken();
  if (!token) {
    return {
      success: false,
      error: 'GitHub token not configured',
      code: 'NO_TOKEN',
    };
  }

  // Clear cache if forcing refresh
  if (forceRefresh) {
    await clearCache(username);
  }

  // Check cache for global stats
  const cached = await getFromCache(username);
  const hasFreshGlobalData = cached && !isExpired(cached);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30000);
    });

    if (hasFreshGlobalData) {
      // Cache hit: use cached global data, fetch fresh repo history
      let repoHistory = cached.data.repoHistory;

      if (prContext) {
        // Always fetch fresh repo history for accurate "X PRs here" count
        repoHistory = await Promise.race([
          fetchRepoHistory(username, prContext, token),
          timeoutPromise,
        ]);
      }

      // Combine cached global with fresh repo history
      const contributorData = {
        ...cached.data,
        repoHistory,
      };
      const score = calculateScore(contributorData);

      // Return combined data (don't update cache - repo history is context-specific)
      return {
        success: true,
        data: {
          data: contributorData,
          score,
          fetchedAt: cached.fetchedAt,
        },
      };
    }

    // Cache miss: fetch everything fresh
    const contributorData = await Promise.race([
      fetchContributorData(username, token, prContext),
      timeoutPromise,
    ]);
    const score = calculateScore(contributorData);

    const data: CachedContributor = {
      data: contributorData,
      score,
      fetchedAt: Date.now(),
    };

    // Save to cache (includes repo history from this context, but that's fine)
    await saveToCache(username, data);

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SlopScore] Fetch error:', errorMessage);

    if (errorMessage === 'USER_NOT_FOUND') {
      return { success: false, error: 'User not found', code: 'USER_NOT_FOUND' };
    }
    if (errorMessage === 'INVALID_TOKEN') {
      return {
        success: false,
        error: 'Invalid GitHub token - please update in settings',
        code: 'NO_TOKEN',
      };
    }
    if (errorMessage === 'RATE_LIMITED') {
      return {
        success: false,
        error: 'GitHub API rate limit exceeded',
        code: 'RATE_LIMITED',
      };
    }
    if (errorMessage === 'TIMEOUT') {
      return {
        success: false,
        error: 'Request timed out - try again',
        code: 'TIMEOUT',
      };
    }

    return { success: false, error: errorMessage, code: 'API_ERROR' };
  }
}

async function handleGetRateLimit(): Promise<RateLimitMessageResponse> {
  const token = await getToken();
  if (!token) {
    return {
      success: false,
      error: 'GitHub token not configured',
      code: 'NO_TOKEN',
    };
  }

  try {
    const rateLimit = await fetchRateLimit(token);
    return { success: true, data: rateLimit };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SlopScore] Rate limit fetch error:', errorMessage);

    if (errorMessage === 'INVALID_TOKEN') {
      return { success: false, error: 'Invalid GitHub token', code: 'NO_TOKEN' };
    }
    if (errorMessage === 'RATE_LIMITED') {
      return { success: false, error: 'Rate limited', code: 'RATE_LIMITED' };
    }
    return { success: false, error: errorMessage, code: 'API_ERROR' };
  }
}
