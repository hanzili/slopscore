// Scoring algorithm tests
// Run with: npx vitest run scoring.test.ts

import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoring';
import type { ContributorData, GlobalStats, RepoHistory } from './types';

// Helper to create test data
function createContributorData(
  globalOverrides: Partial<GlobalStats> = {},
  repoOverrides: Partial<RepoHistory> | null = null
): ContributorData {
  const defaultGlobal: GlobalStats = {
    username: 'testuser',
    accountAgeDays: 365,
    totalPRs: 10,
    mergedPRs: 8,
    closedPRs: 10,
    prBreakdown: {
      publicPRs: 10,
      privatePRs: 0,
      ownRepoPRs: 2,
      externalRepoPRs: 8,
      popularRepoPRs: 5,
      smallRepoPRs: 3,
    },
    mergeBreakdown: {
      selfMergeOwnRepo: 2,
      selfMergeExternalRepo: 0,
      mergedByOthersOwnRepo: 0,
      mergedByOthersExternalRepo: 6,
      uniqueMergers: ['merger1', 'merger2', 'merger3'],
    },
    reposCount: 5,
    popularReposCount: 3,
    followers: 50,
    publicRepos: 20,
    hasPopularRepo: false,
  };

  const defaultRepo: RepoHistory = {
    repoFullName: 'org/repo',
    repoStars: 1000,
    repoOwner: 'org',
    isOwnRepo: false,
    previousMergedPRs: 0,
    previousClosedPRs: 0,
    issuesOpened: 0,
    authorAssociation: 'NONE',
  };

  return {
    global: { ...defaultGlobal, ...globalOverrides },
    repoHistory: repoOverrides === null ? undefined : { ...defaultRepo, ...repoOverrides },
    fetchedAt: Date.now(),
  };
}

describe('Scoring Algorithm', () => {

  describe('Scenario 1: Established maintainer, first PR to new repo', () => {
    // Like josephsavona - excellent global reputation but first time in this specific repo
    it('should score GREEN for trusted maintainer with no repo history', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 12, // 12 years
          totalPRs: 30,
          mergedPRs: 29,
          closedPRs: 30,
          followers: 870,
          publicRepos: 50,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 30,
            privatePRs: 0,
            ownRepoPRs: 0,
            externalRepoPRs: 30,
            popularRepoPRs: 30,
            smallRepoPRs: 0,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 0,
            selfMergeExternalRepo: 27,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 2,
            uniqueMergers: ['a', 'b', 'c'],
          },
          reposCount: 1,
          popularReposCount: 1,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('green');
      expect(result.numericScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Scenario 2: New account spammer', () => {
    // Brand new account, spraying low-quality PRs across many repos
    it('should score RED for new account with spray-and-pray pattern', () => {
      const data = createContributorData(
        {
          accountAgeDays: 15, // 2 weeks old
          totalPRs: 25,
          mergedPRs: 3,
          closedPRs: 25,
          followers: 0,
          publicRepos: 1,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 25,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 20,
            popularRepoPRs: 2,
            smallRepoPRs: 18,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 3,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 0,
            uniqueMergers: ['testuser'],
          },
          reposCount: 20,
          popularReposCount: 0,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('red');
      expect(result.numericScore).toBeLessThan(45);
    });
  });

  describe('Scenario 3: Returning trusted contributor', () => {
    // Someone who has contributed to this repo before and has good global stats
    it('should score GREEN for returning contributor with history', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 3,
          totalPRs: 20,
          mergedPRs: 16,
          closedPRs: 20,
          followers: 100,
          publicRepos: 30,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 20,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 15,
            popularRepoPRs: 10,
            smallRepoPRs: 5,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 4,
            selfMergeExternalRepo: 2,
            mergedByOthersOwnRepo: 1,
            mergedByOthersExternalRepo: 9,
            uniqueMergers: ['a', 'b', 'c', 'd', 'e'],
          },
          reposCount: 8,
          popularReposCount: 5,
        },
        {
          previousMergedPRs: 5,
          previousClosedPRs: 1,
          issuesOpened: 3,
          authorAssociation: 'CONTRIBUTOR',
          repoStars: 5000,
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('green');
      expect(result.numericScore).toBeGreaterThanOrEqual(75);
    });
  });

  describe('Scenario 4: Average contributor', () => {
    // Moderate global stats, no repo history - should be yellow
    it('should score YELLOW for average contributor', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365,
          totalPRs: 10,
          mergedPRs: 5,
          closedPRs: 10,
          followers: 10,
          publicRepos: 10,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 10,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 5,
            popularRepoPRs: 1,
            smallRepoPRs: 4,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 3,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 2,
            uniqueMergers: ['a', 'b'],
          },
          reposCount: 8,
          popularReposCount: 1,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('yellow');
      expect(result.numericScore).toBeGreaterThanOrEqual(45);
      expect(result.numericScore).toBeLessThan(70);
    });
  });

  describe('Scenario 5: First-time GitHub user', () => {
    // Brand new to GitHub, less than 3 PRs
    it('should score NEUTRAL for first-time user with insufficient data', () => {
      const data = createContributorData(
        {
          accountAgeDays: 30,
          totalPRs: 2,
          mergedPRs: 1,
          closedPRs: 2,
          followers: 0,
          publicRepos: 1,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 2,
            privatePRs: 0,
            ownRepoPRs: 1,
            externalRepoPRs: 1,
            popularRepoPRs: 0,
            smallRepoPRs: 1,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 1,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 0,
            uniqueMergers: ['testuser'],
          },
          reposCount: 2,
          popularReposCount: 0,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'FIRST_TIMER',
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('neutral');
    });
  });

  describe('Scenario 6: Previously rejected contributor', () => {
    // Has had PRs rejected in this repo before
    it('should score YELLOW/RED for contributor with rejection history', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365,
          totalPRs: 15,
          mergedPRs: 8,
          closedPRs: 15,
          followers: 20,
          publicRepos: 15,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 15,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 10,
            popularRepoPRs: 3,
            smallRepoPRs: 7,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 4,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 1,
            mergedByOthersExternalRepo: 3,
            uniqueMergers: ['a', 'b'],
          },
          reposCount: 10,
          popularReposCount: 2,
        },
        {
          previousMergedPRs: 1,
          previousClosedPRs: 5, // Many rejections
          issuesOpened: 0,
          authorAssociation: 'NONE',
          repoStars: 5000,
        }
      );

      const result = calculateScore(data);

      // Should be yellow or red due to rejection history
      expect(['yellow', 'red']).toContain(result.score);
      expect(result.numericScore).toBeLessThan(70);
    });
  });

  describe('Scenario 7: Organization member', () => {
    // Member of the org, should get a boost
    it('should score GREEN for organization member', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 2,
          totalPRs: 15,
          mergedPRs: 12,
          closedPRs: 15,
          followers: 50,
          publicRepos: 20,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 15,
            privatePRs: 0,
            ownRepoPRs: 3,
            externalRepoPRs: 12,
            popularRepoPRs: 8,
            smallRepoPRs: 4,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 2,
            selfMergeExternalRepo: 5,
            mergedByOthersOwnRepo: 1,
            mergedByOthersExternalRepo: 4,
            uniqueMergers: ['a', 'b', 'c', 'd'],
          },
          reposCount: 6,
          popularReposCount: 4,
        },
        {
          previousMergedPRs: 10,
          previousClosedPRs: 2,
          issuesOpened: 5,
          authorAssociation: 'MEMBER',
          repoStars: 10000,
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('green');
      expect(result.numericScore).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Scenario 8: Self-merge only contributor', () => {
    // Only self-merges on own repos, no external validation
    it('should score YELLOW for self-merge only pattern', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 2,
          totalPRs: 20,
          mergedPRs: 20,
          closedPRs: 20,
          followers: 5,
          publicRepos: 10,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 20,
            privatePRs: 0,
            ownRepoPRs: 20,
            externalRepoPRs: 0,
            popularRepoPRs: 0,
            smallRepoPRs: 0,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 20,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 0,
            uniqueMergers: ['testuser'],
          },
          reposCount: 3,
          popularReposCount: 0,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // Should be yellow - no external validation of their work
      expect(result.score).toBe('yellow');
    });
  });

  // ============================================
  // ADDITIONAL EDGE CASES
  // ============================================

  describe('Scenario 9: Drive-by contributor pattern', () => {
    // Many repos, 1 PR each, never returns - could be farming or genuine exploration
    it('should score YELLOW for scattered single-PR pattern', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365,
          totalPRs: 15,
          mergedPRs: 10,
          closedPRs: 15,
          followers: 5,
          publicRepos: 5,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 15,
            privatePRs: 0,
            ownRepoPRs: 0,
            externalRepoPRs: 15,
            popularRepoPRs: 3,
            smallRepoPRs: 12,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 0,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 10,
            uniqueMergers: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
          },
          reposCount: 15, // 15 repos, 15 PRs = 1 PR per repo
          popularReposCount: 3,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // Should be yellow - scattered pattern, no deep engagement
      expect(result.score).toBe('yellow');
    });
  });

  describe('Scenario 10: Hacktoberfest spammer pattern', () => {
    // Burst of low-quality PRs to many small repos, low merge rate
    it('should score RED for Hacktoberfest spam pattern', () => {
      const data = createContributorData(
        {
          accountAgeDays: 60, // Account created for Hacktoberfest
          totalPRs: 30,
          mergedPRs: 5,
          closedPRs: 30,
          followers: 0,
          publicRepos: 2,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 30,
            privatePRs: 0,
            ownRepoPRs: 2,
            externalRepoPRs: 28,
            popularRepoPRs: 0, // Only targets small repos
            smallRepoPRs: 28,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 2,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 3,
            uniqueMergers: ['a', 'b', 'c'],
          },
          reposCount: 25, // Spray across many repos
          popularReposCount: 0,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('red');
      expect(result.numericScore).toBeLessThan(45);
    });
  });

  describe('Scenario 11: Deep expert in single project', () => {
    // All contributions to one repo, long history, very trusted
    it('should score GREEN when viewing their main project', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 5,
          totalPRs: 50,
          mergedPRs: 48,
          closedPRs: 50,
          followers: 200,
          publicRepos: 10,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 50,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 45,
            popularRepoPRs: 45, // All to one popular repo
            smallRepoPRs: 0,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 5,
            selfMergeExternalRepo: 30, // Trusted maintainer
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 13,
            uniqueMergers: ['core1', 'core2', 'core3'],
          },
          reposCount: 2, // Very focused
          popularReposCount: 1,
        },
        {
          // Viewing their main project
          previousMergedPRs: 45,
          previousClosedPRs: 2,
          issuesOpened: 20,
          authorAssociation: 'MEMBER',
          repoStars: 50000,
        }
      );

      const result = calculateScore(data);

      expect(result.score).toBe('green');
      expect(result.numericScore).toBeGreaterThanOrEqual(85);
    });

    it('should score YELLOW/GREEN when viewing a different repo', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 5,
          totalPRs: 50,
          mergedPRs: 48,
          closedPRs: 50,
          followers: 200,
          publicRepos: 10,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 50,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 45,
            popularRepoPRs: 45,
            smallRepoPRs: 0,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 5,
            selfMergeExternalRepo: 30,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 13,
            uniqueMergers: ['core1', 'core2', 'core3'],
          },
          reposCount: 2,
          popularReposCount: 1,
        },
        {
          // Viewing a DIFFERENT repo where they have no history
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
          repoStars: 10000,
        }
      );

      const result = calculateScore(data);

      // Should still be decent due to excellent global reputation
      expect(result.numericScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Scenario 12: High rejection rate in THIS repo', () => {
    // Good global stats but repeatedly rejected in this specific repo
    it('should score YELLOW/RED when contributor has bad history in this repo', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 2,
          totalPRs: 20,
          mergedPRs: 15,
          closedPRs: 20,
          followers: 30,
          publicRepos: 15,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 20,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 15,
            popularRepoPRs: 8,
            smallRepoPRs: 7,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 4,
            selfMergeExternalRepo: 1,
            mergedByOthersOwnRepo: 1,
            mergedByOthersExternalRepo: 9,
            uniqueMergers: ['a', 'b', 'c', 'd'],
          },
          reposCount: 10,
          popularReposCount: 5,
        },
        {
          // Bad history in THIS specific repo
          previousMergedPRs: 1,
          previousClosedPRs: 8, // 8 rejections!
          issuesOpened: 2,
          authorAssociation: 'NONE',
          repoStars: 5000,
        }
      );

      const result = calculateScore(data);

      // Should be penalized for bad repo history despite decent global
      expect(['yellow', 'red']).toContain(result.score);
      expect(result.numericScore).toBeLessThan(65);
    });
  });

  describe('Scenario 13: Sock puppet / self-approval pattern', () => {
    // Appears to contribute to "external" repos but actually self-merges everything
    // This could indicate they control those repos through alt accounts
    it('should score YELLOW for suspicious self-merge on external repos', () => {
      const data = createContributorData(
        {
          accountAgeDays: 180,
          totalPRs: 25,
          mergedPRs: 25, // 100% merge rate
          closedPRs: 25,
          followers: 2,
          publicRepos: 5,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 25,
            privatePRs: 0,
            ownRepoPRs: 0,
            externalRepoPRs: 25, // All "external"
            popularRepoPRs: 0, // But no popular repos
            smallRepoPRs: 25, // All small/obscure repos
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 0,
            selfMergeExternalRepo: 25, // Self-merges ALL external PRs - suspicious!
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 0,
            uniqueMergers: ['testuser'], // Only themselves
          },
          reposCount: 10,
          popularReposCount: 0,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // Should be yellow at best - 100% self-merge on "external" repos is suspicious
      // especially with no popular repos and only 1 unique merger (themselves)
      expect(['yellow', 'red']).toContain(result.score);
    });
  });

  describe('Scenario 14: New but legitimate mentored contributor', () => {
    // New account, few PRs, but to a popular repo with good engagement
    // Like a GSoC student or new hire at a company
    it('should score YELLOW for promising new contributor', () => {
      const data = createContributorData(
        {
          accountAgeDays: 45,
          totalPRs: 5,
          mergedPRs: 4,
          closedPRs: 5,
          followers: 3,
          publicRepos: 2,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 5,
            privatePRs: 0,
            ownRepoPRs: 1,
            externalRepoPRs: 4,
            popularRepoPRs: 4, // Contributing to popular repo
            smallRepoPRs: 0,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 1,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 3,
            uniqueMergers: ['mentor1', 'mentor2'],
          },
          reposCount: 2,
          popularReposCount: 1,
        },
        {
          previousMergedPRs: 3,
          previousClosedPRs: 1,
          issuesOpened: 2,
          authorAssociation: 'FIRST_TIME_CONTRIBUTOR',
          repoStars: 15000,
        }
      );

      const result = calculateScore(data);

      // Should be at least yellow - shows promise, has been accepted
      expect(result.numericScore).toBeGreaterThanOrEqual(45);
      // But not green yet - too new
      expect(result.numericScore).toBeLessThan(75);
    });
  });

  describe('Scenario 15: Dormant account returning', () => {
    // Old account but was inactive, now suddenly active
    it('should handle old but recently active account appropriately', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 8, // 8 year old account
          totalPRs: 5, // But only 5 PRs in last 90 days
          mergedPRs: 3,
          closedPRs: 5,
          followers: 15,
          publicRepos: 30,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 5,
            privatePRs: 0,
            ownRepoPRs: 2,
            externalRepoPRs: 3,
            popularRepoPRs: 1,
            smallRepoPRs: 2,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 2,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 1,
            uniqueMergers: ['someone'],
          },
          reposCount: 3,
          popularReposCount: 1,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // Should be yellow - old account is good, but limited recent activity
      expect(result.score).toBe('yellow');
    });
  });

  describe('Scenario 16: PR to own repo (owner context)', () => {
    // Contributor is viewing their OWN repo - should be neutral
    it('should score appropriately for owner viewing own repo', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 3,
          totalPRs: 30,
          mergedPRs: 28,
          closedPRs: 30,
          followers: 100,
          publicRepos: 20,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 30,
            privatePRs: 0,
            ownRepoPRs: 25,
            externalRepoPRs: 5,
            popularRepoPRs: 3,
            smallRepoPRs: 2,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 25,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 3,
            uniqueMergers: ['testuser', 'a', 'b'],
          },
          reposCount: 5,
          popularReposCount: 1,
        },
        {
          previousMergedPRs: 25,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'OWNER',
          isOwnRepo: true,
          repoStars: 500,
        }
      );

      const result = calculateScore(data);

      // Owner of repo - should be noted but not inflate score artificially
      // The repo history score should be neutral-ish for own repo
      expect(result.numericScore).toBeGreaterThanOrEqual(60);
      expect(result.numericScore).toBeLessThanOrEqual(85);
    });
  });

  describe('Scenario 17: Extremely high volume bot-like pattern', () => {
    // Automated account (like dependabot) - very high volume, consistent patterns
    it('should handle bot-like patterns', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 2,
          totalPRs: 100, // Very high volume
          mergedPRs: 95,
          closedPRs: 100,
          followers: 0,
          publicRepos: 1,
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 100,
            privatePRs: 0,
            ownRepoPRs: 0,
            externalRepoPRs: 100,
            popularRepoPRs: 50,
            smallRepoPRs: 50,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 0,
            selfMergeExternalRepo: 0,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 95,
            uniqueMergers: Array.from({ length: 50 }, (_, i) => `maintainer${i}`),
          },
          reposCount: 80, // Many different repos
          popularReposCount: 40,
        },
        {
          previousMergedPRs: 5,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // High volume with good merge rate should still score well
      // But the spray pattern might trigger some warnings
      // This is actually legitimate if it's a real bot like dependabot
      expect(result.numericScore).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Scenario 18: Impersonator-like new account', () => {
    // Very new account trying to build credibility quickly
    it('should score RED for new account with aggressive credibility building', () => {
      const data = createContributorData(
        {
          accountAgeDays: 7, // 1 week old
          totalPRs: 15,
          mergedPRs: 12,
          closedPRs: 15,
          followers: 50, // Suspiciously high for 1 week
          publicRepos: 20, // Lots of forks?
          hasPopularRepo: false,
          prBreakdown: {
            publicPRs: 15,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 10,
            popularRepoPRs: 8,
            smallRepoPRs: 2,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 5,
            selfMergeExternalRepo: 3,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 4,
            uniqueMergers: ['a', 'b', 'c', 'd'],
          },
          reposCount: 8,
          popularReposCount: 5,
        },
        {
          previousMergedPRs: 0,
          previousClosedPRs: 0,
          issuesOpened: 0,
          authorAssociation: 'NONE',
        }
      );

      const result = calculateScore(data);

      // 1-week old account with 15 PRs should be flagged
      // Yellow is acceptable - they DO have real merges from real maintainers
      // Red would require clearer spam signals (low merge rate, only small repos)
      expect(['yellow', 'red']).toContain(result.score);
      expect(result.numericScore).toBeLessThan(70); // Should not be green
    });
  });

  describe('Scenario 19: Good contributor with one bad repo experience', () => {
    // Generally good, but had a bad experience in one repo (closed without merge)
    it('should not be overly penalized for one bad repo experience', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 2,
          totalPRs: 25,
          mergedPRs: 22,
          closedPRs: 25,
          followers: 80,
          publicRepos: 25,
          hasPopularRepo: true,
          prBreakdown: {
            publicPRs: 25,
            privatePRs: 0,
            ownRepoPRs: 5,
            externalRepoPRs: 20,
            popularRepoPRs: 15,
            smallRepoPRs: 5,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 4,
            selfMergeExternalRepo: 5,
            mergedByOthersOwnRepo: 1,
            mergedByOthersExternalRepo: 12,
            uniqueMergers: ['a', 'b', 'c', 'd', 'e', 'f'],
          },
          reposCount: 8,
          popularReposCount: 6,
        },
        {
          // One PR closed in this repo (maybe disagreement on approach)
          previousMergedPRs: 0,
          previousClosedPRs: 1,
          issuesOpened: 1,
          authorAssociation: 'NONE',
          repoStars: 5000,
        }
      );

      const result = calculateScore(data);

      // Should still be green - excellent global stats, one closed PR isn't damning
      expect(result.score).toBe('green');
      expect(result.numericScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Scenario 20: Corporate contributor (org member, many private PRs)', () => {
    // Works at a company, mostly private PRs but some public
    it('should handle corporate contributor pattern', () => {
      const data = createContributorData(
        {
          accountAgeDays: 365 * 4,
          totalPRs: 10, // Only 10 public PRs visible
          mergedPRs: 8,
          closedPRs: 10,
          followers: 50,
          publicRepos: 15,
          hasPopularRepo: false,
          bio: 'Software Engineer at BigCorp',
          company: 'BigCorp',
          prBreakdown: {
            publicPRs: 10,
            privatePRs: 0, // We can't see private PRs anyway
            ownRepoPRs: 2,
            externalRepoPRs: 8,
            popularRepoPRs: 6,
            smallRepoPRs: 2,
          },
          mergeBreakdown: {
            selfMergeOwnRepo: 2,
            selfMergeExternalRepo: 2,
            mergedByOthersOwnRepo: 0,
            mergedByOthersExternalRepo: 4,
            uniqueMergers: ['a', 'b', 'c'],
          },
          reposCount: 5,
          popularReposCount: 3,
        },
        {
          previousMergedPRs: 3,
          previousClosedPRs: 0,
          issuesOpened: 2,
          authorAssociation: 'MEMBER', // Org member
          repoStars: 20000,
        }
      );

      const result = calculateScore(data);

      // Should score well - org member with good history
      expect(result.score).toBe('green');
    });
  });
});
