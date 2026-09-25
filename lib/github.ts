export class GitHubError extends Error {
  constructor(message: string, public readonly status: number = 502) {
    super(message); this.name = 'GitHubError';
  }
}
export interface GitHubClient { get<T>(path: string): Promise<T> }

export function createGitHubClient(token?: string, fetcher: typeof fetch = fetch): GitHubClient {
  return {
    async get<T>(path: string): Promise<T> {
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
        throw new GitHubError('Invalid GitHub API path.', 400);
      }
      const url = new URL(path, 'https://api.github.com');
      if (url.origin !== 'https://api.github.com') throw new GitHubError('Invalid GitHub API host.', 400);
      const headers = new Headers({ Accept: 'application/vnd.github+json', 'User-Agent': 'github-issue-investigator' });
      if (token?.trim()) headers.set('Authorization', `Bearer ${token.trim()}`);
      try {
        const response = await fetcher(url, {
          headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const limited = response.status === 429 || (response.status === 403 &&
            (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
          if (limited) throw new GitHubError('GitHub rate limit reached. Please wait before trying again.', 429);
          if (response.status === 404) throw new GitHubError('Public repository or issue not found.', 404);
          if (response.status === 401 || response.status === 403) throw new GitHubError('GitHub access denied. The site owner may need to check the server token.', 502);
          throw new GitHubError('GitHub could not complete this request. Please try again later.', 502);
        }
        const text = await response.text();
        if (text.length > 4_000_000) throw new GitHubError('GitHub response exceeded the supported size.', 502);
        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
          throw new GitHubError('GitHub request timed out. Please try again.', 504);
        }
        // Never expose upstream response bodies, credentials, or network internals.
        throw new GitHubError('Unable to read a valid response from GitHub.', 502);
      }
    },
  };
}
