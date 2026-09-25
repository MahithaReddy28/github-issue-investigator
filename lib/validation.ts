export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

export type IssueRef = { owner: string; repo: string; number: number; url: string };

export function parseIssueUrl(input: unknown): IssueRef {
  const invalid = () => new ValidationError('Enter a public GitHub issue URL: https://github.com/owner/repo/issues/123');
  if (typeof input !== 'string' || input.length > 2048) throw invalid();
  const raw = input.trim();
  // Validate the raw path too: URL parsers normalize traversal and backslashes.
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*\/?(?:#[^\s]*)?$/.test(raw)) throw invalid();
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw invalid(); }
  if (parsed.origin !== 'https://github.com' || parsed.username || parsed.password || parsed.search) throw invalid();
  const match = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)\/?$/.exec(parsed.pathname);
  if (!match || ['.', '..'].includes(match[2])) throw invalid();
  const [, owner, repo, id] = match;
  const number = Number(id);
  if (!Number.isSafeInteger(number) || owner.length > 39 || repo.length > 100) throw invalid();
  return { owner, repo, number, url: `https://github.com/${owner}/${repo}/issues/${number}` };
}
