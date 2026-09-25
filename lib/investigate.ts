import type { GitHubClient } from './github';
import { GitHubError } from './github';
import { parseIssueUrl, ValidationError } from './validation';

type RawIssue = {
  number: number; title: string; body: string | null; state: string;
  comments: number; labels: (string | { name: string })[];
  user: { login: string } | null; created_at: string; updated_at: string;
  pull_request?: unknown;
};
type RawComment = { id: number; body: string | null; user: { login: string } | null; created_at: string };
type SearchResults = { items: RawIssue[]; incomplete_results?: boolean };
export type Report = {
  repository: string; generatedAt: string;
  issue: { number: number; title: string; body: string; state: string; url: string; author: string; labels: string[]; commentCount: number; createdAt: string; updatedAt: string };
  comments: { id: number; body: string; author: string; url: string; createdAt: string }[];
  related: { number: number; title: string; state: string; url: string; kind: 'issue' | 'pull request' }[];
  facts: { text: string; source: string }[];
  hypotheses: { status: 'Unverified hypothesis'; title: string; evidence: string; source: string; nextStep: string }[];
  nextSteps: string[]; warnings: string[]; searchQuery: string;
};
const stopWords = new Set(['this', 'that', 'with', 'from', 'when', 'have', 'does', 'after', 'before', 'issue', 'error', 'please', 'using', 'cannot', 'the', 'and', 'for', 'not']);

export async function investigate(input: unknown, client: GitHubClient): Promise<Report> {
  const ref = parseIssueUrl(input);
  const repository = `${ref.owner}/${ref.repo}`;
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const metadata = await client.get<{ private: boolean }>(base);
  if (metadata.private !== false) throw new ValidationError('Only public repositories are supported.');
  const raw = await client.get<RawIssue>(`${base}/issues/${ref.number}`);
  if (raw.pull_request) throw new ValidationError('This URL identifies a pull request. Enter an issue URL instead.');
  if (typeof raw.title !== 'string' || raw.number !== ref.number || !Array.isArray(raw.labels)) throw new GitHubError('GitHub returned an unexpected issue response.');
  const title = raw.title.slice(0, 512);
  const terms = [...new Set((title.toLowerCase().match(/[a-z0-9]{3,24}/g) ?? []).filter(word => !stopWords.has(word)))].slice(0, 3);
  const scope = `repo:${repository} is:public`;
  const primaryQuery = terms.length ? `${scope} ${terms.join(' ')} in:title,body` : `${scope} ${ref.number} in:body`;
  const search = (query: string) => client.get<SearchResults>(`/search/issues?q=${encodeURIComponent(query)}&per_page=8&sort=updated`);
  const warnings = [
    'Heuristic investigation only: no AI model, code execution, or verified root-cause diagnosis.',
    'Discussion is limited to the first 30 comments. Related results are keyword matches, not confirmed links or fixes.',
    'Source code, attachments, cross-repository references, and pull-request diffs are not inspected.',
  ];
  const [discussionResult, searchResult] = await Promise.allSettled([
    client.get<RawComment[]>(`${base}/issues/${ref.number}/comments?per_page=30&page=1`), search(primaryQuery),
  ]);
  let discussion: RawComment[] = [];
  if (discussionResult.status === 'fulfilled' && Array.isArray(discussionResult.value)) discussion = discussionResult.value;
  else warnings.push('Discussion unavailable. The report does not include comment evidence.');
  let searchQuery = primaryQuery;
  let relatedRaw: RawIssue[] = [];
  if (searchResult.status === 'fulfilled' && Array.isArray(searchResult.value.items)) {
    relatedRaw = searchResult.value.items.filter(item => item.number !== ref.number);
    if (searchResult.value.incomplete_results) warnings.push('GitHub marked the related search as incomplete.');
    // Broaden an empty result once rather than implying no related issue exists.
    if (relatedRaw.length === 0 && terms.length > 1) {
      searchQuery = `${scope} ${terms[0]} in:title,body`;
      try {
        const fallback = await search(searchQuery);
        relatedRaw = Array.isArray(fallback.items) ? fallback.items.filter(item => item.number !== ref.number) : [];
        warnings.push('No matches in the initial search; a broader one-keyword search was used.');
        if (fallback.incomplete_results) warnings.push('GitHub marked the broader search as incomplete.');
      } catch { warnings.push('The broader related search was unavailable.'); }
    }
  } else warnings.push('Related search unavailable. No conclusion about related issues can be drawn.');
  if (raw.comments > 30) warnings.push(`Only the first 30 of ${raw.comments} comments were retrieved.`);
  const clipped = (text: string | null, max: number) => (text ?? '').slice(0, max);
  if ((raw.body?.length ?? 0) > 16000 || discussion.some(c => (c.body?.length ?? 0) > 6000)) warnings.push('Long issue or comment text was truncated for this report.');
  const issue: Report['issue'] = {
    number: ref.number, title, body: clipped(raw.body, 16000), state: raw.state,
    url: ref.url, author: raw.user?.login ?? 'deleted-user',
    labels: raw.labels.map(label => typeof label === 'string' ? label : label.name).filter(Boolean),
    commentCount: raw.comments, createdAt: raw.created_at, updatedAt: raw.updated_at,
  };
  const comments = discussion.slice(0, 30).filter(comment => Number.isSafeInteger(comment.id)).map(comment => ({
    id: comment.id, body: clipped(comment.body, 6000), author: comment.user?.login ?? 'deleted-user',
    url: `${ref.url}#issuecomment-${comment.id}`, createdAt: comment.created_at,
  }));
  const related: Report['related'] = relatedRaw.filter(item => Number.isSafeInteger(item.number) && item.number > 0 && typeof item.title === 'string').slice(0, 8).map(item => ({
    number: item.number, title: item.title.slice(0, 512), state: item.state,
    kind: item.pull_request ? 'pull request' : 'issue',
    url: `https://github.com/${repository}/${item.pull_request ? 'pull' : 'issues'}/${item.number}`,
  }));
  const facts = [
    { text: `GitHub reports issue #${ref.number} as ${issue.state}.`, source: ref.url },
    { text: `Reported by ${issue.author}; ${raw.comments} comments reported by GitHub.`, source: ref.url },
    { text: `${comments.length} comments included in this report.`, source: ref.url },
  ];
  const evidence = [{ body: `${title}\n${issue.body}`, source: ref.url }, ...comments.map(comment => ({ body: comment.body, source: comment.url }))];
  const rules = [
    { pattern: /TypeError|ReferenceError|undefined|null pointer/i, title: 'Unexpected runtime value', nextStep: 'Reproduce the reported stack trace and inspect values at the first application-owned frame.' },
    { pattern: /timeout|ECONNRESET|network|connection refused/i, title: 'Network or timeout condition', nextStep: 'Reproduce with request timings and compare connectivity, retries, and timeout configuration.' },
    { pattern: /regression|after upgrad|previous version|used to work/i, title: 'Version-dependent regression', nextStep: 'Compare a known-working version with the failing version; narrow the change with a minimal reproduction.' },
    { pattern: /permission|unauthorized|forbidden|EACCES/i, title: 'Access or permission mismatch', nextStep: 'Compare expected permissions with actual credentials and file access; do not share secret values.' },
  ];
  const hypotheses: Report['hypotheses'] = [];
  for (const rule of rules) {
    const found = evidence.find(item => rule.pattern.test(item.body));
    if (found) {
      const matched = rule.pattern.exec(found.body);
      const start = Math.max(0, (matched?.index ?? 0) - 60);
      hypotheses.push({ status: 'Unverified hypothesis', title: rule.title, evidence: found.body.slice(start, start + 220), source: found.source, nextStep: rule.nextStep });
    }
  }
  return {
    repository, generatedAt: new Date().toISOString(), issue, comments, related, facts, hypotheses, warnings, searchQuery,
    nextSteps: [
      'Confirm expected versus actual behavior and produce the smallest reproducible example.',
      'Record operating system, runtime, dependency versions, and a sanitized stack trace.',
      'Read the linked discussion and candidate pull requests before assuming a match or fix.',
      'Add a failing regression test before changing code; rerun the relevant checks after the fix.',
    ],
  };
}

// Plain escaped text rather than rendered user Markdown prevents embedded HTML/links
// from becoming active content in exports. Original sources remain explicitly linked.
function md(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, character => `\\${character}`)
    .replace(/\r?\n/g, '  \n');
}
export function toMarkdown(report: Report): string {
  return [
    `# Investigation: ${md(report.issue.title)}`,
    `Repository: ${md(report.repository)}  \nRetrieved: ${report.generatedAt}  \nSource: ${report.issue.url}`,
    '**Not a verified root cause.** This report separates GitHub metadata from unverified hypotheses.',
    '## Verified metadata', ...report.facts.map(fact => `- ${md(fact.text)} ([source](${fact.source}))`),
    '## Issue description (untrusted source text)', md(report.issue.body || 'No description provided.'),
    '## Unverified hypotheses', ...(report.hypotheses.length ? report.hypotheses.map(h => `### ${md(h.title)}\n${h.status}\n\nEvidence excerpt: ${md(h.evidence)}\n\nSource: ${h.source}\n\nNext step: ${md(h.nextStep)}`) : ['No rule matched. This does not rule out a defect; investigate manually.']),
    '## Potentially related results', ...(report.related.length ? report.related.map(item => `- [${md(item.title)}](${item.url}) — ${item.kind}, ${md(item.state)}`) : ['No candidates found in this bounded search.']),
    `Search query: ${md(report.searchQuery)}`,
    '## Discussion excerpts', ...report.comments.map(comment => `### ${md(comment.author)}\n${comment.url}\n\n${md(comment.body)}`),
    '## Next debugging steps', ...report.nextSteps.map(step => `- ${md(step)}`),
    '## Limits and warnings', ...report.warnings.map(warning => `- ${md(warning)}`),
  ].join('\n\n');
}
