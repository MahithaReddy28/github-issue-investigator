import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueUrl, ValidationError } from '../lib/validation';

describe('parseIssueUrl', () => {
  it('normalizes a valid issue URL', () => {
    assert.deepEqual(parseIssueUrl(' https://github.com/octocat/Hello-World/issues/42#issuecomment-1 '), {
      owner: 'octocat', repo: 'Hello-World', number: 42,
      url: 'https://github.com/octocat/Hello-World/issues/42',
    });
  });
  for (const input of [null, {}, '', 'not a url', 'http://github.com/a/b/issues/1',
    'https://github.com.evil.test/a/b/issues/1', 'https://evil.test/a/b/issues/1',
    'https://user:pass@github.com/a/b/issues/1', 'https://github.com:444/a/b/issues/1',
    'https://github.com/a/b/pull/1', 'https://github.com/a/b/issues/0',
    'https://github.com/a/b/issues/-1', 'https://github.com/a/b/issues/9007199254740993',
    'https://github.com/a/b/issues/1/extra', 'https://github.com/a/%2e%2e/issues/1',
    'https://github.com/a/b/issues/1?x=1', 'x'.repeat(2050)]) {
    it(`rejects invalid input ${String(input).slice(0, 80)}`, () => {
      assert.throws(() => parseIssueUrl(input), ValidationError);
    });
  }
});
