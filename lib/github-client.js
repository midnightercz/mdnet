/**
 * GitHub REST API client for fetching repository files
 */
class GitHubClient {
  constructor(token) {
    this.baseUrl = 'https://api.github.com';
    this.token = token;
  }

  /**
   * Make an authenticated request to the GitHub API
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @returns {Promise<object>} API response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mdnet-indexer',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    let lastError;

    // Retry with exponential backoff (max 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        // Check rate limiting
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');

        if (response.status === 403 && remaining === '0') {
          const resetDate = new Date(parseInt(reset) * 1000);
          const minutesUntilReset = Math.ceil((resetDate - new Date()) / 1000 / 60);
          throw new Error(
            `GitHub API rate limit exceeded\n` +
            `  Remaining: 0/5000\n` +
            `  Resets at: ${resetDate.toISOString()} (in ${minutesUntilReset} minutes)\n\n` +
            `Wait or use a different token.`
          );
        }

        if (response.status === 401) {
          throw new Error(
            `GitHub authentication failed (HTTP 401)\n\n` +
            `Set GITHUB_TOKEN environment variable:\n` +
            `  export GITHUB_TOKEN=ghp_xxxxxxxxxxxxx\n\n` +
            `Generate token at: https://github.com/settings/tokens\n` +
            `Required scopes: repo (for private repos) or public_repo`
          );
        }

        if (response.status === 404) {
          throw new Error(
            `Repository or resource not found (HTTP 404)\n` +
            `  Endpoint: ${endpoint}\n\n` +
            `Check that the repository exists and you have access.`
          );
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `GitHub API error (HTTP ${response.status})\n` +
            `  Endpoint: ${endpoint}\n` +
            `  Response: ${errorBody}`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error;

        // Don't retry on auth or rate limit errors
        if (error.message.includes('rate limit') ||
            error.message.includes('authentication') ||
            error.message.includes('not found')) {
          throw error;
        }

        // Retry on network errors
        if (attempt < 3) {
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s
          console.log(`Request failed, retrying in ${delayMs/1000}s (attempt ${attempt}/3)...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get repository tree (file listing)
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} branch - Branch or tag name
   * @returns {Promise<Array<{path: string, sha: string, type: string, size: number}>>}
   */
  async getTree(owner, repo, branch = 'main') {
    const data = await this.request(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );

    // Warn if tree is truncated (GitHub limit is 100,000 entries)
    if (data.truncated) {
      console.warn('Warning: Repository tree is truncated (>100,000 entries).');
      console.warn('Some files may not be indexed. Consider using --path to filter.');
    }

    // Filter for .md files only (case-insensitive, exclude .bak.md)
    return data.tree.filter(item => {
      const lowerPath = item.path.toLowerCase();
      return item.type === 'blob' &&
             lowerPath.endsWith('.md') &&
             !lowerPath.endsWith('.bak.md');
    });
  }

  /**
   * Get file content by blob SHA
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} sha - Git blob SHA
   * @returns {Promise<string>} File content as UTF-8 string
   */
  async getBlob(owner, repo, sha) {
    const data = await this.request(
      `/repos/${owner}/${repo}/git/blobs/${sha}`
    );

    // Decode base64 content
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return data.content;
  }

  /**
   * Get latest commit for a branch
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} branch - Branch or tag name
   * @returns {Promise<{sha: string}>} Commit info
   */
  async getBranchCommit(owner, repo, branch) {
    const data = await this.request(
      `/repos/${owner}/${repo}/commits/${branch}`
    );

    return { sha: data.sha };
  }

  /**
   * Get current rate limit status
   * @returns {Promise<{limit: number, remaining: number, reset: Date}>}
   */
  async getRateLimit() {
    const data = await this.request('/rate_limit');

    return {
      limit: data.rate.limit,
      remaining: data.rate.remaining,
      reset: new Date(data.rate.reset * 1000)
    };
  }
}

module.exports = GitHubClient;
