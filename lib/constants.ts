// Configuration constants for SlopScore

// Cache settings - smart TTL based on account maturity
export const CACHE_TTL_ESTABLISHED_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for established accounts (>1 year, >50 PRs)
export const CACHE_TTL_MODERATE_MS = 3 * 24 * 60 * 60 * 1000;    // 3 days for moderate accounts (90-365 days)
export const CACHE_TTL_NEW_MS = 24 * 60 * 60 * 1000;             // 24 hours for new accounts (<90 days)
export const CACHE_TTL_INSUFFICIENT_MS = 12 * 60 * 60 * 1000;    // 12 hours for insufficient data (<3 PRs)
export const CACHE_KEY_PREFIX = 'slopscore:';
export const TOKEN_STORAGE_KEY = 'slopscore:github_token';

// API settings
export const GITHUB_API_BASE = 'https://api.github.com';
export const PR_LOOKBACK_DAYS = 180; // 6 months for better coverage of established contributors

// Scoring thresholds
export const MIN_PRS_FOR_SCORE = 3;
export const RED_MERGE_RATE_THRESHOLD = 0.1;
export const YELLOW_MERGE_RATE_THRESHOLD = 0.4;
export const RED_REPOS_THRESHOLD = 15;
export const NEW_ACCOUNT_DAYS = 30;
export const MODERATE_ACCOUNT_DAYS = 90;
export const HIGH_VOLUME_PRS = 20;
export const MODERATE_VOLUME_PRS = 10;
export const HIGH_SELF_MERGE_RATE = 0.5;

// UI settings
export const BADGE_ID = 'slopscore-badge';
