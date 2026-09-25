import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, toMarkdown } from '../lib/investigate';
import { createGitHubClient, GitHubError } from '../lib/github';
import { ValidationError } from '../lib/validation';

const url = 'https://github.com/acme/widget/issues/12';
const issue = { number: 12, title: 'Crash on startup', body: 'TypeError in startup', state: 'open', html_url: url, comments: 1, labels: [{ name: 'bug' }], user: { login: 'reporter' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' };
function fixture(options: { failComments?: boolean; privateRepo?: boolean; pr?: boolean; related?: boolean } = {}) {
  const paths: string[] = [];
  return { paths, client: { async get<T>(path: string): Promise<T> {
    paths.push(path);
    if (path === '/repos/acme/widget') return { private: !!options.privateRepo } as T;
    if (path.includes('/comments')) {
      if (options.failComments) throw new GitHubError('Rate limited.', 429);
      return [{ id: 1, body: 'Reproduced on Node 22', html_url: `${url}#issuecomment-1`, user: { login: 'helper' }, created_at: '2026-01-02T00:00:00Z' }] as T;
    }
    if (path.startsWith('/search/issues')) return { incomplete_results: false, items: options.related ? [issue, { ...issue, number: 13, html_url: 'https://github.com/acme/widget/pull/13', pull_request: {}, title: 'Startup crash fix' }] : [] } as T;
    return { ...issue, ...(options.pr ? { pull_request: {} } : {}) } as T;
  } } };
}

describe('investigation', () => {
  it('collects public evidence and labels hypotheses', async () => {
    const f = fixture({ related: true });
    const report = await investigate(url, f.client);
    assert.equal(report.issue.title, issue.title);
    assert.equal(report.comments.length, 1);
    assert.equal(report.related.length, 1);
    assert.equal(report.related[0].kind, 'pull request');
    assert.ok(report.hypotheses.every(h => h.status === 'Unverified hypothesis'));
    assert.ok(report.facts.every(fact => fact.source.startsWith('https://github.com/')));
    assert.match(toMarkdown(report), /Not a verified root cause/);
    assert.ok(f.paths.some(path => path.startsWith('/search/issues?q=')));
  });
  it('returns explicit partial results when comments fail', async () => {
    const report = await investigate(url, fixture({ failComments: true }).client);
    assert.equal(report.comments.length, 0);
    assert.ok(report.warnings.some(w => w.includes('Discussion unavailable')));
  });
  it('rejects private repositories before retrieving issue text', async () => {
    const f = fixture({ privateRepo: true });
    await assert.rejects(investigate(url, f.client), ValidationError);
    assert.equal(f.paths.length, 1);
  });
  it('rejects pull requests submitted as issues', async () => {
    await assert.rejects(investigate(url, fixture({ pr: true }).client), ValidationError);
  });
  it('does not contact GitHub for invalid input', async () => {
    const f = fixture();
    await assert.rejects(investigate('https://evil.test', f.client), ValidationError);
    assert.equal(f.paths.length, 0);
  });
  it('escapes HTML in exported untrusted content', async () => {
    const report = await investigate(url, fixture().client);
    report.issue.body = '<script>alert(1)</script>';
    assert.ok(!toMarkdown(report).includes('<script>'));
  });
});

describe('GitHub transport', () => {
  it('uses GitHub only and never forwards redirects', async () => {
    let called = false;
    const mock = (async (input: string | URL | Request, init?: RequestInit) => {
      called = true;
      assert.equal(String(input), 'https://api.github.com/repos/a/b');
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only');
      return new Response('{"private":false}', { status: 200 });
    }) as typeof fetch;
    const client = createGitHubClient('test-only', mock);
    await client.get('/repos/a/b');
    assert.ok(called);
    await assert.rejects(client.get('https://evil.test'), GitHubError);
    await assert.rejects(client.get('//evil.test'), GitHubError);
  });
  it('maps exhausted rate limits without exposing upstream content', async () => {
    const mock = (async () => new Response('secret upstream content', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })) as typeof fetch;
    await assert.rejects(createGitHubClient(undefined, mock).get('/repos/a/b'), (error: unknown) => error instanceof GitHubError && error.status === 429 && !error.message.includes('secret'));
  });
  it('maps unavailable and malformed responses', async () => {
    for (const response of [new Response('', { status: 404 }), new Response('bad-json', { status: 200 })]) {
      const mock = (async () => response) as typeof fetch;
      await assert.rejects(createGitHubClient(undefined, mock).get('/repos/a/b'), GitHubError);
    }
  });
});
