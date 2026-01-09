// Cache layer using browser.storage.local

import type { CachedContributor } from './types';
import {
  CACHE_TTL_ESTABLISHED_MS,
  CACHE_TTL_MODERATE_MS,
  CACHE_TTL_NEW_MS,
  CACHE_TTL_INSUFFICIENT_MS,
  CACHE_KEY_PREFIX,
  TOKEN_STORAGE_KEY,
} from './constants';

/**
 * Validate cached data has expected structure
 */
function isValidCacheData(data: unknown): data is CachedContributor {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.fetchedAt !== 'number') return false;
  if (!d.data || typeof d.data !== 'object') return false;
  const innerData = d.data as Record<string, unknown>;
  if (!innerData.global || typeof innerData.global !== 'object') return false;
  return true;
}

/**
 * Get cached contributor data
 */
export async function getFromCache(username: string): Promise<CachedContributor | null> {
  const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;
  const result = await browser.storage.local.get(key);
  const cached = result[key];

  // Validate structure - old cache format might be different
  if (!isValidCacheData(cached)) {
    // Clear invalid cache entry
    if (cached) {
      await browser.storage.local.remove(key);
    }
    return null;
  }

  return cached;
}

/**
 * Save contributor data to cache
 */
export async function saveToCache(username: string, data: CachedContributor): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;
  await browser.storage.local.set({ [key]: data });
}

/**
 * Get appropriate TTL based on account maturity
 * - Established accounts (>1 year, >50 PRs): 7 days
 * - Moderate accounts (90-365 days): 3 days
 * - New accounts (<90 days): 24 hours
 * - Insufficient data (<3 PRs): 12 hours
 */
function getTTL(data: CachedContributor): number {
  // Safety check for malformed data
  if (!data?.data?.global) {
    return CACHE_TTL_INSUFFICIENT_MS;
  }

  const { global } = data.data;
  const { accountAgeDays, totalPRs, closedPRs } = global;

  // Insufficient data - check more frequently
  if (closedPRs < 3) {
    return CACHE_TTL_INSUFFICIENT_MS;
  }

  // Established account - very stable reputation
  if (accountAgeDays > 365 && totalPRs > 50) {
    return CACHE_TTL_ESTABLISHED_MS;
  }

  // Moderate account
  if (accountAgeDays >= 90) {
    return CACHE_TTL_MODERATE_MS;
  }

  // New account
  return CACHE_TTL_NEW_MS;
}

/**
 * Check if cached data is expired (uses smart TTL based on account maturity)
 */
export function isExpired(data: CachedContributor): boolean {
  const ttl = getTTL(data);
  return Date.now() - data.fetchedAt > ttl;
}

/**
 * Clear cached data for a user (used for refresh)
 */
export async function clearCache(username: string): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;
  await browser.storage.local.remove(key);
}

/**
 * Clear all cached contributor data (keeps token)
 */
export async function clearAllCache(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(
    key => key.startsWith(CACHE_KEY_PREFIX) && key !== TOKEN_STORAGE_KEY
  );
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
}

/**
 * Get stored GitHub token
 */
export async function getToken(): Promise<string | null> {
  const result = await browser.storage.local.get(TOKEN_STORAGE_KEY);
  return (result[TOKEN_STORAGE_KEY] as string) || null;
}

/**
 * Save GitHub token
 */
export async function setToken(token: string): Promise<void> {
  await browser.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
}

/**
 * Clear GitHub token
 */
export async function clearToken(): Promise<void> {
  await browser.storage.local.remove(TOKEN_STORAGE_KEY);
}
