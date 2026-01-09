# SlopScore

**Cross-repo contributor reputation for GitHub PRs**

A Chrome extension that helps maintainers instantly assess PR authors by analyzing their contribution history across all of GitHub.

## Why?

GitHub only tells you if someone is a "first-time contributor" to your repo. It doesn't tell you if they have a history of rejected PRs, spam contributions, or suspicious patterns elsewhere.

SlopScore fills that gap by showing a reputation badge right next to the PR author's name.

## Score Levels

| Badge | Score | Meaning |
|-------|-------|---------|
| 🟢 Likely Safe | 70-100 | Established contributor with good track record |
| 🟡 Review Carefully | 45-69 | Mixed signals or limited history |
| 🔴 Caution | 0-44 | Red flags detected |
| ⚪ New Contributor | - | Insufficient data (<3 PRs) |

## What It Analyzes

**Global signals** (cached):
- Merge rate across all contributions
- Repo quality (popular repos vs spam targets)
- Trust indicators (who merges their PRs)
- Account maturity

**Repo-specific signals** (always fresh):
- Previous PRs in this repo
- Author association (member, collaborator, first-timer)

**Red flags detected**:
- Spray-and-pray patterns (new account + high volume + many repos)
- Very low external merge rate
- Only self-merges on own repos

## Installation

1. Clone this repo
2. `npm install`
3. `npm run build`
4. Go to `chrome://extensions`, enable Developer mode
5. Click "Load unpacked" → select `.output/chrome-mv3`

**Setup**: Click the extension icon, add a GitHub token with `public_repo` scope.

## Development

```bash
npm install      # Install dependencies
npm run dev      # Development with hot reload
npm test         # Run tests
npm run build    # Production build
```

## Privacy

- All processing happens locally in your browser
- API calls go directly to GitHub
- No analytics, no tracking, no external servers
- Token stored only in local browser storage

## License

MIT
