/**
 * Base interfaces for git provider integrations
 */

export interface PublishParams {
  repoUrl: string;
  branch: string;
  filePath: string;
  content: string;
  message: string;
  token: string;
}

export interface PublishResult {
  success: boolean;
  error?: string;
  commitUrl?: string;
  commitSha?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  username?: string;
}

export interface FetchFileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface GitProvider {
  name: string;

  // Token management
  getToken(sourceName: string): string | null;
  setToken(sourceName: string, token: string): void;
  removeToken(sourceName: string): void;

  // Validate token has correct permissions
  validateToken(token: string, repoUrl: string): Promise<TokenValidationResult>;

  // Publish a file to git
  publishFile(params: PublishParams): Promise<PublishResult>;

  // Get instructions URL for creating token
  getTokenInstructions(): string;

  // Fetch file content (optional, for providers with CORS issues)
  fetchFileContent?(repoUrl: string, branch: string, filePath: string, token: string): Promise<FetchFileResult>;
}
