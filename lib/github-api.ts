// GitHub API wrapper using GraphQL for efficiency
// Uses 1-2 queries instead of 40+ REST calls

import type {
  GlobalStats,
  RepoHistory,
  ContributorData,
  PRBreakdown,
  MergeBreakdown,
  PRContext,
  AuthorAssociation,
  RateLimitInfo,
} from './types';
import { PR_LOOKBACK_DAYS } from './constants';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/**
 * Execute a GraphQL query
 */
async function graphqlQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('[SlopScore] GraphQL HTTP error:', response.status, response.statusText);
      if (response.status === 401) throw new Error('INVALID_TOKEN');
      if (response.status === 403) throw new Error('RATE_LIMITED');
      throw new Error(`API_ERROR: ${response.status}`);
    }

    const json = await response.json();

    if (json.errors) {
      const error = json.errors[0];
      console.error('[SlopScore] GraphQL error:', JSON.stringify(json.errors, null, 2));
      if (error.type === 'NOT_FOUND') throw new Error('USER_NOT_FOUND');
      if (error.type === 'RATE_LIMITED') throw new Error('RATE_LIMITED');
      throw new Error(`API_ERROR: ${error.message || JSON.stringify(error)}`);
    }

    return json.data as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main query to fetch contributor data
 * Gets user info, repos, and PRs in one query
 */
const CONTRIBUTOR_QUERY = `
query ContributorData($username: String!) {
  user(login: $username) {
    login
    createdAt
    followers { totalCount }
    following { totalCount }
    repositories(first: 10, orderBy: {field: STARGAZERS, direction: DESC}, ownerAffiliations: OWNER) {
      totalCount
      nodes {
        name
        stargazerCount
        isFork
      }
    }
    bio
    company
    pullRequests(first: 100, states: [MERGED, CLOSED], orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number
        state
        merged
        mergedAt
        createdAt
        author { login }
        mergedBy { login }
        repository {
          nameWithOwner
          owner { login }
          stargazerCount
          isPrivate
        }
      }
    }
  }
}
`;

/**
 * Query to fetch repo-specific history
 */
const REPO_HISTORY_QUERY = `
query RepoHistory($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    nameWithOwner
    stargazerCount
    owner { login }
    pullRequest(number: $prNumber) {
      authorAssociation
    }
  }
  mergedPRs: search(query: "is:pr is:merged author:@username repo:@owner/@repo", type: ISSUE, first: 100) {
    issueCount
  }
  closedPRs: search(query: "is:pr is:closed author:@username repo:@owner/@repo", type: ISSUE, first: 100) {
    issueCount
  }
  issues: search(query: "is:issue author:@username repo:@owner/@repo", type: ISSUE, first: 100) {
    issueCount
  }
}
`;

interface GraphQLContributorResponse {
  user: {
    login: string;
    createdAt: string;
    followers: { totalCount: number };
    following: { totalCount: number };
    repositories: {
      totalCount: number;
      nodes: Array<{
        name: string;
        stargazerCount: number;
        isFork: boolean;
      }>;
    };
    bio: string | null;
    company: string | null;
    pullRequests: {
      totalCount: number;
      nodes: Array<{
        number: number;
        state: string;
        merged: boolean;
        mergedAt: string | null;
        createdAt: string;
        author: { login: string } | null;
        mergedBy: { login: string } | null;
        repository: {
          nameWithOwner: string;
          owner: { login: string };
          stargazerCount: number;
          isPrivate: boolean;
        };
      }>;
    };
  };
}

interface GraphQLRepoHistoryResponse {
  repository: {
    nameWithOwner: string;
    stargazerCount: number;
    owner: { login: string };
    pullRequest: {
      authorAssociation: AuthorAssociation;
    } | null;
  } | null;
  mergedPRs: { issueCount: number };
  closedPRs: { issueCount: number };
  issues: { issueCount: number };
}

/**
 * Fetch complete contributor data using GraphQL
 */
export async function fetchContributorData(
  username: string,
  token: string,
  prContext?: PRContext
): Promise<ContributorData> {
  // Calculate lookback date
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - PR_LOOKBACK_DAYS);

  // Fetch main contributor data
  const data = await graphqlQuery<GraphQLContributorResponse>(
    CONTRIBUTOR_QUERY,
    { username },
    token
  );

  const user = data.user;

  // Calculate account age
  const createdAt = new Date(user.createdAt);
  const accountAgeDays = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Filter PRs to lookback period
  const recentPRs = user.pullRequests.nodes.filter(pr => {
    const prDate = new Date(pr.createdAt);
    return prDate >= lookbackDate;
  });

  // Calculate PR breakdown
  const prBreakdown = calculatePRBreakdownFromGraphQL(recentPRs, username);

  // Calculate merge breakdown
  const mergedPRs = recentPRs.filter(pr => pr.merged);
  const mergeBreakdown = calculateMergeBreakdownFromGraphQL(mergedPRs, username);

  // Count unique repos
  const uniqueRepos = new Set(recentPRs.map(pr => pr.repository.nameWithOwner));

  // Count popular repos contributed to
  const popularRepos = new Set<string>();
  for (const pr of recentPRs) {
    if (
      pr.repository.stargazerCount >= 100 &&
      pr.repository.owner.login !== username &&
      !pr.repository.isPrivate
    ) {
      popularRepos.add(pr.repository.nameWithOwner);
    }
  }

  // Check if user has a popular repo (100+ stars, not a fork)
  const hasPopularRepo = user.repositories.nodes.some(
    repo => repo.stargazerCount >= 100 && !repo.isFork
  );

  const globalStats: GlobalStats = {
    username: user.login,
    accountAgeDays,
    totalPRs: recentPRs.length,
    mergedPRs: mergedPRs.length,
    closedPRs: recentPRs.length,
    prBreakdown,
    mergeBreakdown,
    reposCount: uniqueRepos.size,
    popularReposCount: popularRepos.size,
    followers: user.followers.totalCount,
    publicRepos: user.repositories.totalCount,
    hasPopularRepo,
    bio: user.bio || undefined,
    company: user.company || undefined,
  };

  // Fetch repo-specific history if prContext provided
  let repoHistory: RepoHistory | undefined;
  if (prContext) {
    repoHistory = await fetchRepoHistory(username, prContext, token);
  }

  return {
    global: globalStats,
    repoHistory,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch repo-specific history using GraphQL
 */
export async function fetchRepoHistory(
  username: string,
  prContext: PRContext,
  token: string
): Promise<RepoHistory> {
  const { owner, repo, prNumber } = prContext;
  const repoFullName = `${owner}/${repo}`;

  // Build query with replaced username and repo
  const query = REPO_HISTORY_QUERY
    .replace(/@username/g, username)
    .replace(/@owner/g, owner)
    .replace(/@repo/g, repo);

  try {
    const data = await graphqlQuery<GraphQLRepoHistoryResponse>(
      query,
      { owner, repo, prNumber },
      token
    );

    const repoData = data.repository;
    const mergedCount = data.mergedPRs.issueCount;
    const closedCount = data.closedPRs.issueCount;
    const issuesCount = data.issues.issueCount;

    return {
      repoFullName,
      repoStars: repoData?.stargazerCount || 0,
      repoOwner: owner,
      isOwnRepo: repoData?.owner.login === username,
      previousMergedPRs: mergedCount,
      previousClosedPRs: Math.max(0, closedCount - mergedCount),
      issuesOpened: issuesCount,
      firstContributionDate: undefined, // Not easily available via GraphQL
      authorAssociation: repoData?.pullRequest?.authorAssociation || 'NONE',
    };
  } catch (error) {
    // Log the error for debugging
    console.error('[SlopScore] Repo history query failed:', error);
    console.error('[SlopScore] Context:', { owner, repo, prNumber, username });

    // Return default values on error
    return {
      repoFullName,
      repoStars: 0,
      repoOwner: owner,
      isOwnRepo: false,
      previousMergedPRs: 0,
      previousClosedPRs: 0,
      issuesOpened: 0,
      firstContributionDate: undefined,
      authorAssociation: 'NONE',
    };
  }
}

/**
 * Calculate PR breakdown from GraphQL data
 */
function calculatePRBreakdownFromGraphQL(
  prs: GraphQLContributorResponse['user']['pullRequests']['nodes'],
  username: string
): PRBreakdown {
  let publicPRs = 0;
  let privatePRs = 0;
  let ownRepoPRs = 0;
  let externalRepoPRs = 0;
  let popularRepoPRs = 0;
  let smallRepoPRs = 0;

  for (const pr of prs) {
    if (pr.repository.isPrivate) {
      privatePRs++;
    } else {
      publicPRs++;

      if (pr.repository.owner.login === username) {
        ownRepoPRs++;
      } else {
        externalRepoPRs++;

        if (pr.repository.stargazerCount >= 100) {
          popularRepoPRs++;
        } else {
          smallRepoPRs++;
        }
      }
    }
  }

  return {
    publicPRs,
    privatePRs,
    ownRepoPRs,
    externalRepoPRs,
    popularRepoPRs,
    smallRepoPRs,
  };
}

/**
 * Calculate merge breakdown from GraphQL data
 */
function calculateMergeBreakdownFromGraphQL(
  mergedPRs: GraphQLContributorResponse['user']['pullRequests']['nodes'],
  username: string
): MergeBreakdown {
  let selfMergeOwnRepo = 0;
  let selfMergeExternalRepo = 0;
  let mergedByOthersOwnRepo = 0;
  let mergedByOthersExternalRepo = 0;
  const uniqueMergers = new Set<string>();

  for (const pr of mergedPRs) {
    if (!pr.merged || !pr.mergedBy) continue;

    const mergerLogin = pr.mergedBy.login;
    const isOwnRepo = pr.repository.owner.login === username;
    const isSelfMerge = mergerLogin === username;

    if (mergerLogin) {
      uniqueMergers.add(mergerLogin);
    }

    if (isSelfMerge) {
      if (isOwnRepo) {
        selfMergeOwnRepo++;
      } else {
        selfMergeExternalRepo++;
      }
    } else {
      if (isOwnRepo) {
        mergedByOthersOwnRepo++;
      } else {
        mergedByOthersExternalRepo++;
      }
    }
  }

  return {
    selfMergeOwnRepo,
    selfMergeExternalRepo,
    mergedByOthersOwnRepo,
    mergedByOthersExternalRepo,
    uniqueMergers: Array.from(uniqueMergers),
  };
}

/**
 * Validate a GitHub token using GraphQL
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    await graphqlQuery<{ viewer: { login: string } }>(
      `query { viewer { login } }`,
      {},
      token
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch current rate limit status
 */
export async function fetchRateLimit(token: string): Promise<RateLimitInfo> {
  const data = await graphqlQuery<{
    rateLimit: {
      limit: number;
      remaining: number;
      resetAt: string;
    };
  }>(
    `query { rateLimit { limit remaining resetAt } }`,
    {},
    token
  );

  return {
    limit: data.rateLimit.limit,
    remaining: data.rateLimit.remaining,
    resetAt: data.rateLimit.resetAt,
  };
}
