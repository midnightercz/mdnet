/**
 * GitLab REST API client for fetching repository files
 */
class GitLabClient {
  constructor(token, hostname = 'https://gitlab.com') {
    // If hostname includes /api/v4, use it as is (for backward compatibility)
    // Otherwise, append /api/v4
    this.baseUrl = hostname.includes('/api/v4') ? hostname : `${hostname}/api/v4`;
    this.hostname = hostname.replace('/api/v4', ''); // Store base hostname for URL building
    this.token = token;
  }

  /**
   * Make an authenticated request to the GitLab API
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @returns {Promise<object>} API response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'User-Agent': 'mdnet-indexer',
      ...options.headers
    };

    if (this.token) {
      headers['PRIVATE-TOKEN'] = this.token;
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
        const rateLimit = response.headers.get('RateLimit-Limit');
        const remaining = response.headers.get('RateLimit-Remaining');
        const reset = response.headers.get('RateLimit-Reset');

        if (response.status === 429 || (response.status === 403 && remaining === '0')) {
          const resetDate = reset ? new Date(parseInt(reset) * 1000) : new Date(Date.now() + 3600000);
          const minutesUntilReset = Math.ceil((resetDate - new Date()) / 1000 / 60);
          throw new Error(
            `GitLab API rate limit exceeded\n` +
            `  Remaining: ${remaining || 0}/${rateLimit || 600}\n` +
            `  Resets at: ${resetDate.toISOString()} (in ${minutesUntilReset} minutes)\n\n` +
            `Wait or use a different token.`
          );
        }

        if (response.status === 401) {
          throw new Error(
            `GitLab authentication failed (HTTP 401)\n\n` +
            `Set GITLAB_TOKEN environment variable:\n` +
            `  export GITLAB_TOKEN=glpat-xxxxxxxxxxxxx\n\n` +
            `Generate token at: https://gitlab.com/-/profile/personal_access_tokens\n` +
            `Required scopes: api or read_api`
          );
        }

        if (response.status === 404) {
          throw new Error(
            `Project or resource not found (HTTP 404)\n` +
            `  Endpoint: ${endpoint}\n\n` +
            `Check that the project exists and you have access.\n` +
            `For project paths, use URL encoding (group%2Fproject).`
          );
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `GitLab API error (HTTP ${response.status})\n` +
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
   * URL-encode a file path for GitLab API
   * @param {string} filePath - File path to encode
   * @returns {string} URL-encoded path
   */
  encodeFilePath(filePath) {
    // GitLab requires double encoding for file paths
    return encodeURIComponent(filePath);
  }

  /**
   * Get repository tree (file listing) with pagination support
   * @param {string} projectId - Project ID or URL-encoded path (group%2Fproject)
   * @param {string} branch - Branch or tag name
   * @param {string} path - Optional subdirectory path filter
   * @returns {Promise<Array<{path: string, id: string, type: string, mode: string}>>}
   */
  async getTree(projectId, branch = 'main', path = '') {
    let allItems = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const params = new URLSearchParams({
        ref: branch,
        recursive: 'true',
        per_page: perPage.toString(),
        page: page.toString()
      });

      if (path) {
        params.set('path', path);
      }

      const data = await this.request(
        `/projects/${encodeURIComponent(projectId)}/repository/tree?${params}`
      );

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      allItems = allItems.concat(data);

      // If we got fewer items than per_page, we're on the last page
      if (data.length < perPage) {
        break;
      }

      page++;
    }

    // Filter for .md files only (case-insensitive, exclude .bak.md)
    return allItems.filter(item => {
      const lowerPath = item.path.toLowerCase();
      return item.type === 'blob' &&
             lowerPath.endsWith('.md') &&
             !lowerPath.endsWith('.bak.md');
    });
  }

  /**
   * Get raw file content
   * @param {string} projectId - Project ID or URL-encoded path
   * @param {string} filePath - Path to file in repository
   * @param {string} branch - Branch or tag name
   * @returns {Promise<string>} File content as UTF-8 string
   */
  async getFileRaw(projectId, filePath, branch) {
    const encodedPath = this.encodeFilePath(filePath);
    const params = new URLSearchParams({ ref: branch });

    const url = `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/repository/files/${encodedPath}/raw?${params}`;
    console.log(`Fetchfile: ${url}`);
    const headers = {
      'User-Agent': 'mdnet-indexer'
    };

    if (this.token) {
      headers['PRIVATE-TOKEN'] = this.token;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${filePath} (HTTP ${response.status})`);
    }

    return await response.text();
  }

  /**
   * Get latest commit for a branch
   * @param {string} projectId - Project ID or URL-encoded path
   * @param {string} branch - Branch or tag name
   * @returns {Promise<{sha: string}>} Commit info
   */
  async getBranchCommit(projectId, branch) {
    const data = await this.request(
      `/projects/${encodeURIComponent(projectId)}/repository/commits/${encodeURIComponent(branch)}`
    );

    return { sha: data.id }; // GitLab uses 'id' for commit SHA
  }
}

module.exports = GitLabClient;
