/**
 * GitHub provider implementation
 */

import { GitProvider, PublishParams, PublishResult, TokenValidationResult, FetchFileResult } from './base';

const GITHUB_TOKEN_STORAGE_KEY = 'mdnet-github-tokens';

export class GitHubProvider implements GitProvider {
  name = 'github';

  getToken(sourceName: string): string | null {
    const tokens = JSON.parse(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '{}');
    return tokens[sourceName] || null;
  }

  setToken(sourceName: string, token: string): void {
    const tokens = JSON.parse(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '{}');
    tokens[sourceName] = token;
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  }

  removeToken(sourceName: string): void {
    const tokens = JSON.parse(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '{}');
    delete tokens[sourceName];
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  }

  async validateToken(token: string, repoUrl: string): Promise<TokenValidationResult> {
    // Extract owner/repo from repoUrl
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return { valid: false, error: 'Invalid GitHub repository URL' };
    }

    const [_, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, ''); // Remove .git suffix if present

    try {
      // Test token by fetching repo info
      const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { valid: true, username: data.owner.login };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid token or insufficient permissions' };
      } else if (response.status === 404) {
        return { valid: false, error: 'Repository not found or token lacks access' };
      } else {
        return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      return { valid: false, error: `Network error: ${error.message}` };
    }
  }

  async publishFile(params: PublishParams): Promise<PublishResult> {
    const { repoUrl, branch, filePath, content, message, token } = params;

    // Extract owner/repo
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return { success: false, error: 'Invalid GitHub repository URL' };
    }
    const [_, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, ''); // Remove .git suffix if present

    try {
      // 1. Get current file SHA (if exists)
      const getResponse = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      let sha: string | undefined;
      if (getResponse.ok) {
        const data = await getResponse.json();
        sha = data.sha;
      }

      // 2. Create/update file
      // Use btoa with proper UTF-8 encoding
      const contentBase64 = btoa(unescape(encodeURIComponent(content)));

      const updateResponse = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message,
            content: contentBase64,
            branch,
            ...(sha && { sha }) // Include SHA only if file exists
          })
        }
      );

      if (updateResponse.ok) {
        const data = await updateResponse.json();
        return {
          success: true,
          commitUrl: data.commit.html_url,
          commitSha: data.commit.sha
        };
      } else {
        const errorData = await updateResponse.json();
        return {
          success: false,
          error: errorData.message || `HTTP ${updateResponse.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  getTokenInstructions(): string {
    return 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token';
  }

  /**
   * Fetch file content from GitHub using the Contents API
   * This avoids CORS issues with raw.githubusercontent.com for private repos
   */
  async fetchFileContent(repoUrl: string, branch: string, filePath: string, token: string): Promise<FetchFileResult> {
    // Extract owner/repo
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return { success: false, error: 'Invalid GitHub repository URL' };
    }

    const [_, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, '');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'File not found' };
        } else if (response.status === 401) {
          return { success: false, error: 'Invalid token or insufficient permissions' };
        } else {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
      }

      const data = await response.json();

      // GitHub API returns content as base64
      if (data.content) {
        // Decode base64 content
        const decodedContent = atob(data.content.replace(/\n/g, ''));
        // Decode UTF-8
        const textContent = decodeURIComponent(escape(decodedContent));
        return { success: true, content: textContent };
      } else {
        return { success: false, error: 'No content in response' };
      }
    } catch (error: any) {
      return { success: false, error: `Network error: ${error.message}` };
    }
  }
}
