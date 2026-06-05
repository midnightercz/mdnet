/**
 * In-memory image cache to avoid redundant GitHub API calls
 * Cache is session-based and cleared on page reload
 */

class ImageCache {
  private cache: Map<string, string> = new Map();

  /**
   * Get cached data URL for an image
   */
  get(url: string): string | undefined {
    return this.cache.get(url);
  }

  /**
   * Store data URL for an image
   */
  set(url: string, dataUrl: string): void {
    this.cache.set(url, dataUrl);
  }

  /**
   * Check if image is in cache
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (number of entries)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove specific entry from cache
   */
  delete(url: string): boolean {
    return this.cache.delete(url);
  }
}

// Export singleton instance
export const imageCache = new ImageCache();
