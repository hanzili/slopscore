// Tests for cache TTL logic

import { describe, it, expect } from 'vitest';
import { getTTL } from './cache';
import type { CachedContributor } from './types';
import {
  CACHE_TTL_ESTABLISHED_MS,
  CACHE_TTL_MODERATE_MS,
  CACHE_TTL_NEW_MS,
  CACHE_TTL_INSUFFICIENT_MS,
} from './constants';

// Helper to create minimal CachedContributor for testing TTL
function createMockData(overrides: {
  accountAgeDays: number;
  totalPRs: number;
  closedPRs: number;
}): CachedContributor {
  return {
    data: {
      global: {
        username: 'testuser',
        accountAgeDays: overrides.accountAgeDays,
        totalPRs: overrides.totalPRs,
        closedPRs: overrides.closedPRs,
        mergedPRs: overrides.closedPRs,
        reposCount: 5,
        popularReposCount: 1,
        followers: 10,
        publicRepos: 5,
        hasPopularRepo: false,
        prBreakdown: {
          publicPRs: overrides.totalPRs,
          privatePRs: 0,
          ownRepoPRs: 0,
          externalRepoPRs: overrides.totalPRs,
          popularRepoPRs: 0,
          smallRepoPRs: overrides.totalPRs,
        },
        mergeBreakdown: {
          selfMergeOwnRepo: 0,
          selfMergeExternalRepo: 0,
          mergedByOthersOwnRepo: 0,
          mergedByOthersExternalRepo: overrides.closedPRs,
          uniqueMergers: ['merger1'],
        },
      },
      fetchedAt: Date.now(),
    },
    score: {
      score: 'green',
      numericScore: 75,
      emoji: '🟢',
      label: '75% merged',
      detail: '',
      breakdown: {
        globalScore: 75,
        repoScore: 75,
        finalScore: 75,
        components: {
          mergeRateScore: 75,
          repoQualityScore: 75,
          trustScore: 75,
          accountScore: 75,
          repoHistoryScore: 75,
        },
        positiveSignals: [],
        negativeSignals: [],
        neutralNotes: [],
      },
    },
    fetchedAt: Date.now(),
  };
}

describe('Cache TTL Logic', () => {
  describe('getTTL', () => {
    it('should return 12 hours for insufficient data (<3 PRs)', () => {
      const data = createMockData({
        accountAgeDays: 500,
        totalPRs: 100,
        closedPRs: 2, // Less than 3
      });

      expect(getTTL(data)).toBe(CACHE_TTL_INSUFFICIENT_MS);
    });

    it('should return 7 days for established accounts (>1 year, >50 PRs)', () => {
      const data = createMockData({
        accountAgeDays: 400, // > 365
        totalPRs: 60, // > 50
        closedPRs: 60,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_ESTABLISHED_MS);
    });

    it('should return 3 days for moderate accounts (90-365 days)', () => {
      const data = createMockData({
        accountAgeDays: 200, // Between 90 and 365
        totalPRs: 30,
        closedPRs: 30,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_MODERATE_MS);
    });

    it('should return 3 days for old account with few PRs', () => {
      // Old account but not enough PRs to be "established"
      const data = createMockData({
        accountAgeDays: 500, // > 365
        totalPRs: 20, // < 50
        closedPRs: 20,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_MODERATE_MS);
    });

    it('should return 24 hours for new accounts (<90 days)', () => {
      const data = createMockData({
        accountAgeDays: 45, // < 90
        totalPRs: 10,
        closedPRs: 10,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_NEW_MS);
    });

    it('should prioritize insufficient data over account age', () => {
      // Even old established account with <3 PRs gets short TTL
      const data = createMockData({
        accountAgeDays: 1000,
        totalPRs: 100,
        closedPRs: 1, // Insufficient
      });

      expect(getTTL(data)).toBe(CACHE_TTL_INSUFFICIENT_MS);
    });

    it('should return 24 hours for brand new account', () => {
      const data = createMockData({
        accountAgeDays: 7,
        totalPRs: 5,
        closedPRs: 5,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_NEW_MS);
    });

    it('should return 3 days for exactly 90-day old account', () => {
      const data = createMockData({
        accountAgeDays: 90, // Exactly 90
        totalPRs: 20,
        closedPRs: 20,
      });

      expect(getTTL(data)).toBe(CACHE_TTL_MODERATE_MS);
    });
  });
});
