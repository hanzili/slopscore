import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'SlopScore',
    description: 'Cross-repo contributor reputation for GitHub PRs',
    permissions: ['storage'],
    host_permissions: [
      'https://github.com/*',
      'https://api.github.com/*'
    ],
  },
});
