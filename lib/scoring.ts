// Sophisticated scoring logic for contributor reputation

import type {
  ContributorData,
  GlobalStats,
  RepoHistory,
  ScoreResult,
} from './types';

/**
 * Calculate comprehensive reputation score
 *
 * Final Score = Global Score × 0.4 + Repo Score × 0.6
 * (Repo-specific history matters more than global stats)
 */
export function calculateScore(data: ContributorData): ScoreResult {
  const { global, repoHistory } = data;

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const neutralNotes: string[] = [];

  // Calculate component scores
  const mergeRateScore = calculateMergeRateScore(global, positiveSignals, negativeSignals, neutralNotes);
  const repoQualityScore = calculateRepoQualityScore(global, positiveSignals, negativeSignals);
  const trustScore = calculateTrustScore(global, positiveSignals, negativeSignals);
  const accountScore = calculateAccountScore(global, positiveSignals, negativeSignals, neutralNotes);
  const repoHistoryScore = repoHistory
    ? calculateRepoHistoryScore(repoHistory, positiveSignals, negativeSignals, neutralNotes)
    : 50; // Neutral if no repo context

  // Calculate global and repo scores
  const globalScore = (mergeRateScore * 0.35) + (repoQualityScore * 0.25) + (trustScore * 0.25) + (accountScore * 0.15);
  const repoScore = repoHistory ? repoHistoryScore : globalScore;

  // Adaptive weighting based on repo history signal strength
  // If first-time to this repo, rely more on global reputation
  // If has history in repo (good or bad), weight repo history more
  let finalScore: number;

  if (!repoHistory) {
    // No repo context at all - use global score only
    finalScore = globalScore;
  } else {
    const hasRepoSignal =
      repoHistory.previousMergedPRs > 0 ||
      repoHistory.previousClosedPRs > 0 ||
      repoHistory.issuesOpened > 0 ||
      (repoHistory.authorAssociation !== 'NONE' &&
       repoHistory.authorAssociation !== 'FIRST_TIME_CONTRIBUTOR' &&
       repoHistory.authorAssociation !== 'FIRST_TIMER');

    if (hasRepoSignal) {
      // Has meaningful repo history - balanced weighting
      finalScore = (globalScore * 0.5) + (repoScore * 0.5);
    } else {
      // First-time to this repo - trust global reputation more
      finalScore = (globalScore * 0.75) + (repoScore * 0.25);
    }
  }

  // Clamp to 0-100
  const clampedScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // Determine grade
  const { grade, emoji } = scoreToGrade(clampedScore, global);

  // Generate label and detail
  const label = generateLabel(global);
  const detail = generateDetail(global, repoHistory);

  return {
    score: grade,
    numericScore: clampedScore,
    emoji,
    label,
    detail,
    breakdown: {
      globalScore: Math.round(globalScore),
      repoScore: Math.round(repoScore),
      finalScore: clampedScore,
      components: {
        mergeRateScore: Math.round(mergeRateScore),
        repoQualityScore: Math.round(repoQualityScore),
        trustScore: Math.round(trustScore),
        accountScore: Math.round(accountScore),
        repoHistoryScore: Math.round(repoHistoryScore),
      },
      positiveSignals,
      negativeSignals,
      neutralNotes,
    },
  };
}

/**
 * Calculate merge rate score (0-100)
 * Weights external repo merges higher than own repo merges
 */
function calculateMergeRateScore(
  stats: GlobalStats,
  positive: string[],
  negative: string[],
  neutral: string[]
): number {
  const { prBreakdown, mergeBreakdown, closedPRs } = stats;

  // Not enough data
  if (closedPRs < 3) {
    neutral.push('Not enough PR history to evaluate (< 3 PRs)');
    return 50;
  }

  // Calculate weighted merge rate
  // External repos count more than own repos
  const externalMerged = mergeBreakdown.mergedByOthersExternalRepo + mergeBreakdown.selfMergeExternalRepo;
  const externalTotal = prBreakdown.externalRepoPRs;

  const ownMerged = mergeBreakdown.mergedByOthersOwnRepo + mergeBreakdown.selfMergeOwnRepo;
  const ownTotal = prBreakdown.ownRepoPRs;

  // External merge rate (most important)
  const externalMergeRate = externalTotal > 0 ? externalMerged / externalTotal : 0;

  // Own repo merge rate (less weight)
  const ownMergeRate = ownTotal > 0 ? ownMerged / ownTotal : 0;

  // Score based on external contributions primarily
  let score = 50;

  if (externalTotal >= 3) {
    // Have enough external PRs to judge
    if (externalMergeRate >= 0.8) {
      score = 90;
      positive.push(`High external merge rate: ${pct(externalMergeRate)}`);
    } else if (externalMergeRate >= 0.6) {
      score = 75;
      positive.push(`Good external merge rate: ${pct(externalMergeRate)}`);
    } else if (externalMergeRate >= 0.4) {
      score = 55;
      neutral.push(`Moderate external merge rate: ${pct(externalMergeRate)}`);
    } else if (externalMergeRate >= 0.2) {
      score = 35;
      negative.push(`Low external merge rate: ${pct(externalMergeRate)}`);
    } else {
      score = 15;
      negative.push(`Very low external merge rate: ${pct(externalMergeRate)}`);
    }
  } else if (ownTotal >= 3) {
    // Only own repo PRs - less useful signal
    neutral.push('Mostly contributes to own repos');
    score = 50 + (ownMergeRate * 20); // Slight boost for high own-repo rate
  } else {
    neutral.push('Limited contribution history');
  }

  return score;
}

/**
 * Calculate repo quality score (0-100)
 * Contributing to popular repos = more credible
 */
function calculateRepoQualityScore(
  stats: GlobalStats,
  positive: string[],
  negative: string[]
): number {
  const { prBreakdown, hasPopularRepo, reposCount } = stats;

  let score = 50;

  // Contributions to popular repos
  if (prBreakdown.popularRepoPRs >= 5) {
    score += 30;
    positive.push(`Contributed to ${prBreakdown.popularRepoPRs} PRs on popular repos (100+ stars)`);
  } else if (prBreakdown.popularRepoPRs >= 2) {
    score += 15;
    positive.push(`Contributed to popular repos (100+ stars)`);
  }

  // Maintains their own popular repo
  if (hasPopularRepo) {
    score += 20;
    positive.push('Maintains popular open source project (100+ stars)');
  }

  // Spray-and-pray detection
  if (reposCount > 15 && prBreakdown.popularRepoPRs < 3) {
    score -= 20;
    negative.push(`PRs spread across ${reposCount} repos (possible spray-and-pray)`);
  }

  // Focused contributor bonus
  if (reposCount <= 5 && stats.mergedPRs >= 5) {
    score += 10;
    positive.push('Focused contributor (few repos, consistent work)');
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate trust score (0-100)
 * Based on who merges their PRs
 */
function calculateTrustScore(
  stats: GlobalStats,
  positive: string[],
  negative: string[]
): number {
  const { mergeBreakdown } = stats;
  const uniqueMergerCount = mergeBreakdown.uniqueMergers.length;

  let score = 50;

  // Self-merge on external repos = trusted maintainer
  if (mergeBreakdown.selfMergeExternalRepo >= 3) {
    score += 30;
    positive.push(`Trusted maintainer: can self-merge on ${mergeBreakdown.selfMergeExternalRepo} external repos`);
  }

  // Multiple different people merge their PRs
  if (uniqueMergerCount >= 5) {
    score += 25;
    positive.push(`${uniqueMergerCount} different maintainers have merged their PRs`);
  } else if (uniqueMergerCount >= 3) {
    score += 15;
    positive.push(`Multiple maintainers (${uniqueMergerCount}) trust their contributions`);
  }

  // Merged by others on external repos (best signal)
  if (mergeBreakdown.mergedByOthersExternalRepo >= 5) {
    score += 20;
    positive.push('Consistently merged by external maintainers');
  }

  // Only self-merges on own repos (less credible)
  const totalMerges = mergeBreakdown.selfMergeOwnRepo + mergeBreakdown.selfMergeExternalRepo +
                      mergeBreakdown.mergedByOthersOwnRepo + mergeBreakdown.mergedByOthersExternalRepo;

  if (totalMerges > 0 && mergeBreakdown.selfMergeOwnRepo === totalMerges) {
    score -= 15;
    negative.push('All merges are self-merges on own repos');
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate account score (0-100)
 * Based on account age, followers, profile completeness
 */
function calculateAccountScore(
  stats: GlobalStats,
  positive: string[],
  negative: string[],
  neutral: string[]
): number {
  const { accountAgeDays, followers, publicRepos, bio, company, totalPRs, reposCount } = stats;

  let score = 50;

  // Account age
  if (accountAgeDays >= 365 * 3) {
    score += 15;
    positive.push('Established account (3+ years)');
  } else if (accountAgeDays >= 365) {
    score += 10;
  } else if (accountAgeDays < 14) {
    // Very new account (< 2 weeks) - highest scrutiny
    const prsPerDay = totalPRs / Math.max(1, accountAgeDays);
    if (prsPerDay >= 2 || totalPRs >= 10) {
      score -= 40;
      negative.push(`Very new account (${accountAgeDays} days) with suspicious activity`);
    } else if (totalPRs >= 5) {
      score -= 25;
      negative.push(`Very new account (${accountAgeDays} days) with high volume`);
    } else {
      score -= 10;
      neutral.push(`Very new account (${accountAgeDays} days)`);
    }
  } else if (accountAgeDays < 30) {
    // New account - check for spam patterns
    if (totalPRs > 20) {
      score -= 30;
      negative.push('New account (< 30 days) with high PR volume');
    } else if (totalPRs > 10 && reposCount > 5) {
      score -= 15;
      negative.push('New account with scattered contributions');
    } else {
      neutral.push('New account (< 30 days)');
    }
  } else if (accountAgeDays < 90) {
    if (totalPRs > 15 && reposCount > 10) {
      score -= 10;
      negative.push('Relatively new account with high volume');
    }
  }

  // Followers
  if (followers >= 100) {
    score += 15;
    positive.push(`Well-followed developer (${followers} followers)`);
  } else if (followers >= 20) {
    score += 5;
  }

  // Public repos
  if (publicRepos >= 20) {
    score += 10;
    positive.push('Active GitHub presence with many public repos');
  }

  // Profile completeness
  if (bio && company) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate repo-specific history score (0-100)
 * History in the current repo being viewed
 */
function calculateRepoHistoryScore(
  history: RepoHistory,
  positive: string[],
  negative: string[],
  neutral: string[]
): number {
  const { previousMergedPRs, previousClosedPRs, issuesOpened, authorAssociation, isOwnRepo, repoStars } = history;

  let score = 50;

  // Previous merged PRs (strong signal)
  if (previousMergedPRs >= 10) {
    score += 35;
    positive.push(`Established contributor: ${previousMergedPRs} previous PRs merged here`);
  } else if (previousMergedPRs >= 5) {
    score += 25;
    positive.push(`Regular contributor: ${previousMergedPRs} previous PRs merged here`);
  } else if (previousMergedPRs >= 2) {
    score += 15;
    positive.push(`Returning contributor: ${previousMergedPRs} previous PRs merged here`);
  } else if (previousMergedPRs === 1) {
    score += 5;
    neutral.push('Has 1 previous merged PR here');
  }

  // Previous rejected PRs - scale penalty with rejection count
  if (previousClosedPRs > previousMergedPRs && previousClosedPRs >= 2) {
    const rejectionPenalty = Math.min(30, previousClosedPRs * 5); // 5 points per rejection, max 30
    score -= rejectionPenalty;
    negative.push(`${previousClosedPRs} PRs closed without merge here`);
  }

  // Issues opened (shows engagement)
  if (issuesOpened >= 3) {
    score += 10;
    positive.push(`Engaged: opened ${issuesOpened} issues here`);
  } else if (issuesOpened >= 1) {
    score += 5;
  }

  // Author association
  switch (authorAssociation) {
    case 'OWNER':
      if (isOwnRepo) {
        neutral.push('This is their own repository');
        score = 70; // Neutral-ish for own repo
      } else {
        score += 30;
        positive.push('Organization owner');
      }
      break;
    case 'MEMBER':
      score += 25;
      positive.push('Organization member');
      break;
    case 'COLLABORATOR':
      score += 20;
      positive.push('Invited collaborator');
      break;
    case 'CONTRIBUTOR':
      score += 10;
      positive.push('Previous contributor');
      break;
    case 'FIRST_TIME_CONTRIBUTOR':
      neutral.push('First-time contributor to this repo');
      break;
    case 'FIRST_TIMER':
      neutral.push('First contribution on GitHub');
      score -= 5;
      break;
    case 'NONE':
      neutral.push('External contributor');
      break;
  }

  // Repo popularity context
  if (repoStars >= 1000 && previousMergedPRs >= 1) {
    score += 10;
    positive.push('Has merged PRs on this popular repo');
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Convert numeric score to grade
 */
function scoreToGrade(
  score: number,
  global: GlobalStats
): { grade: 'green' | 'yellow' | 'red' | 'neutral'; emoji: string } {
  // Insufficient data
  if (global.closedPRs < 3) {
    return { grade: 'neutral', emoji: '⚪' }; // white circle
  }

  // Check for hard red flags regardless of score
  if (global.accountAgeDays < 30 && global.totalPRs > 25 && global.reposCount > 10) {
    return { grade: 'red', emoji: '🔴' }; // red circle
  }

  // Score-based grading
  if (score >= 70) {
    return { grade: 'green', emoji: '🟢' }; // green circle
  } else if (score >= 45) {
    return { grade: 'yellow', emoji: '🟡' }; // yellow circle
  } else {
    return { grade: 'red', emoji: '🔴' }; // red circle
  }
}

/**
 * Generate human-readable label
 */
function generateLabel(stats: GlobalStats): string {
  if (stats.closedPRs < 3) {
    return 'New contributor';
  }

  const mergeRate = stats.closedPRs > 0 ? stats.mergedPRs / stats.closedPRs : 0;
  return `${pct(mergeRate)} merged`;
}

/**
 * Generate detail string
 */
function generateDetail(global: GlobalStats, repoHistory?: RepoHistory): string {
  const parts: string[] = [];

  parts.push(`${global.totalPRs} PRs`);
  parts.push(`${global.reposCount} repos`);
  parts.push(formatAge(global.accountAgeDays));

  if (repoHistory && repoHistory.previousMergedPRs > 0) {
    parts.push(`${repoHistory.previousMergedPRs} here`);
  }

  return parts.join(' \u2022 ');
}

// Helpers
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatAge(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}yr`;
}
