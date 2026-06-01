/**
 * Git provider registry
 */

import { GitProvider } from './base';
import { GitHubProvider } from './github';

const providers = new Map<string, GitProvider>();

// Register providers
providers.set('github', new GitHubProvider());
// Future providers can be added here:
// providers.set('gitlab', new GitLabProvider());
// providers.set('gitea', new GiteaProvider());

export function getProvider(name: string): GitProvider | null {
  return providers.get(name) || null;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
