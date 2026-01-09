// Core data types for SlopScore

// Author's relationship to a repository
export type AuthorAssociation =
  | 'COLLABORATOR'
  | 'CONTRIBUTOR'
  | 'FIRST_TIMER'
  | 'FIRST_TIME_CONTRIBUTOR'
  | 'MANNEQUIN'
  | 'MEMBER'
  | 'NONE'
  | 'OWNER';

// Breakdown of PR contributions by repo context
export interface PRBreakdown {
  // By visibility
  publicPRs: number;
  privatePRs: number;

  // By ownership (public repos only for accurate counting)
  ownRepoPRs: number;        // PRs to repos they own
  externalRepoPRs: number;   // PRs to repos they don't own

  // By repo popularity (external repos only)
  popularRepoPRs: number;    // PRs to repos with 100+ stars
  smallRepoPRs: number;      // PRs to repos with <100 stars
}

// Breakdown of merges by context
export interface MergeBreakdown {
  // Self-merge contexts
  selfMergeOwnRepo: number;           // Self-merged on own repo (neutral)
  selfMergeExternalRepo: number;      // Self-merged on external repo (= trusted maintainer)

  // External merge contexts
  mergedByOthersOwnRepo: number;      // Others merged on your repo (positive)
  mergedByOthersExternalRepo: number; // Others merged on external repo (positive)

  // Unique mergers (diversity of trust)
  uniqueMergers: string[];            // List of unique people who merged your PRs
}

// Repo-specific history (for the current repo being viewed)
export interface RepoHistory {
  repoFullName: string;               // e.g., "facebook/react"
  repoStars: number;
  repoOwner: string;
  isOwnRepo: boolean;                 // Does the contributor own this repo?

  // History in this specific repo
  previousMergedPRs: number;          // PRs previously merged here
  previousClosedPRs: number;          // PRs closed without merge here
  issuesOpened: number;               // Issues opened here
  firstContributionDate?: string;     // When they first contributed

  // Current PR context
  authorAssociation: AuthorAssociation;
}

// Global contributor stats (across all GitHub)
export interface GlobalStats {
  username: string;
  accountAgeDays: number;

  // PR totals
  totalPRs: number;
  mergedPRs: number;
  closedPRs: number;

  // Breakdowns
  prBreakdown: PRBreakdown;
  mergeBreakdown: MergeBreakdown;

  // Repo spread
  reposCount: number;
  popularReposCount: number;          // Repos with 100+ stars they contributed to

  // Profile signals
  followers: number;
  publicRepos: number;
  hasPopularRepo: boolean;            // Do they own a repo with 100+ stars?
  bio?: string;
  company?: string;
}

// Complete contributor data
export interface ContributorData {
  global: GlobalStats;
  repoHistory?: RepoHistory;          // Only if viewing a specific PR
  fetchedAt: number;
}

// Score breakdown for transparency
export interface ScoreBreakdown {
  globalScore: number;                // 0-100 based on global activity
  repoScore: number;                  // 0-100 based on history in this repo
  finalScore: number;                 // Weighted combination

  // Component scores for transparency
  components: {
    mergeRateScore: number;           // Based on merge rate (adjusted for context)
    repoQualityScore: number;         // Based on contributing to popular repos
    trustScore: number;               // Based on who merges their PRs
    accountScore: number;             // Based on account age, followers, etc.
    repoHistoryScore: number;         // Based on history in current repo
  };

  // Flags explaining the score
  positiveSignals: string[];
  negativeSignals: string[];
  neutralNotes: string[];
}

export interface ScoreResult {
  score: 'green' | 'yellow' | 'red' | 'neutral';
  numericScore: number;               // 0-100
  emoji: string;
  label: string;
  detail: string;
  breakdown: ScoreBreakdown;
}

export interface CachedContributor {
  data: ContributorData;
  score: ScoreResult;
  fetchedAt: number;
}

// Rate limit info
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}

// Message types for communication between content script and background
export type MessageType =
  | 'GET_CONTRIBUTOR_STATS'
  | 'REFRESH_STATS'
  | 'GET_TOKEN'
  | 'SET_TOKEN'
  | 'CLEAR_TOKEN'
  | 'GET_RATE_LIMIT';

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
}

export interface GetStatsMessage extends Message {
  type: 'GET_CONTRIBUTOR_STATS' | 'REFRESH_STATS';
  payload: {
    username: string;
    prContext?: PRContext;
  };
}

export interface TokenMessage extends Message {
  type: 'SET_TOKEN';
  payload: { token: string };
}

export interface StatsResponse {
  success: true;
  data: CachedContributor;
}

export interface RateLimitResponse {
  success: true;
  data: RateLimitInfo;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: 'NO_TOKEN' | 'RATE_LIMITED' | 'API_ERROR' | 'USER_NOT_FOUND' | 'TIMEOUT';
}

export type MessageResponse = StatsResponse | ErrorResponse;
export type RateLimitMessageResponse = RateLimitResponse | ErrorResponse;
