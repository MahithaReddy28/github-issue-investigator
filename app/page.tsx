'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { Report } from '../lib/investigate';
import { parseIssueUrl } from '../lib/validation';

type Result = { report: Report; markdown: string };
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleString();
}
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a>;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'related' | 'discussion'>('overview');
  const controller = useRef<AbortController | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    let canonical: string;
    try { canonical = parseIssueUrl(url).url; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid issue URL.'); return; }
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setResult(null);
    const timeout = setTimeout(() => current.abort(), 55000);
    try {
      const response = await fetch('/api/investigate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: canonical }), signal: current.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Investigation failed.');
      if (!data.report || typeof data.markdown !== 'string') throw new Error('The server returned an invalid report.');
      setResult(data); setTab('overview');
    } catch (failure) {
      setError(current.signal.aborted ? 'Investigation stopped or timed out. You can try again.' : failure instanceof Error ? failure.message : 'Unable to reach the server.');
    } finally {
      clearTimeout(timeout); controller.current = null; setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const objectUrl = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `investigation-${result.report.repository.replace('/', '-')}-${result.report.issue.number}.md`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  const report = result?.report;
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
       <Link className="brand" href="/" aria-label="Issue Investigator home">
  <span className="brand-icon" aria-hidden="true">⌕</span>
  <span>issue<span className="brand-light">investigator</span></span>
</Link>
        <div className="topbar-right"><span className="pill"><span className="dot" /> Public repositories</span><ExternalLink href="https://github.com/MahithaReddy28/github-issue-investigator">Source</ExternalLink></div>
      </header>
      <main id="main">
        <section className="hero">
          <p className="eyebrow">LESS TAB SWITCHING. MORE UNDERSTANDING.</p>
          <h1>From open issue<br />to <span>clear next step.</span></h1>
          <p className="hero-description">Bring the evidence together. Explore the discussion, surface related work, and build a debugging plan grounded in sources.</p>
          <form className="search-card" onSubmit={submit} aria-busy={busy}>
            <label htmlFor="issue-url">GITHUB ISSUE URL</label>
            <div className="search-row"><span className="input-icon" aria-hidden="true">↗</span><input id="issue-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/owner/repo/issues/123" required maxLength={2048} disabled={busy} autoComplete="off" spellCheck={false} aria-describedby="input-help" /><button className="primary" type="submit" disabled={busy}>{busy ? 'Investigating…' : 'Investigate issue →'}</button></div>
            <div className="search-help"><p id="input-help">Read-only investigation · No paid AI service · Sources included</p>{busy && <button className="text-button" type="button" onClick={() => controller.current?.abort()}>Cancel</button>}</div>
          </form>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="status-message" role="status" aria-live="polite">{busy ? 'Reading issue metadata, discussion, and related results from GitHub…' : report ? `Investigation ready for issue ${report.issue.number}. Review the evidence below.` : ''}</p>
        </section>
        {!report && !busy && <section className="feature-grid" aria-label="How it works">
          <article className="feature"><span className="step">01 / COLLECT</span><h2>Evidence, not guesswork.</h2><p>Issue details and discussion in one place, with direct links back to GitHub.</p></article>
          <article className="feature"><span className="step">02 / CONNECT</span><h2>Find the nearby work.</h2><p>Discover keyword-matched issues and pull requests worth checking next.</p></article>
          <article className="feature"><span className="step">03 / INVESTIGATE</span><h2>Leave with a plan.</h2><p>Review clearly labelled hypotheses and export a shareable Markdown report.</p></article>
        </section>}
        {busy && <section className="loading-card" aria-label="Investigation in progress"><span className="spinner" aria-hidden="true" /><h2>Following the evidence</h2><p>GitHub requests can take a little time. Partial results will be clearly marked.</p></section>}
        {report && <section className="results" aria-label="Investigation report">
          <div className="report-heading"><div><p className="eyebrow">{report.repository} / #{report.issue.number}</p><h2>{report.issue.title}</h2><p className="muted">Retrieved {date(report.generatedAt)}</p></div><button className="secondary" onClick={download}>↓ Export Markdown</button></div>
          <div className="stats"><div><span>ISSUE STATUS</span><strong>{report.issue.state}</strong></div><div><span>COMMENTS INCLUDED</span><strong>{report.comments.length} <small>/ {report.issue.commentCount}</small></strong></div><div><span>RELATED CANDIDATES</span><strong>{report.related.length}</strong></div><div><span>HYPOTHESES</span><strong>{report.hypotheses.length} <small>unverified</small></strong></div></div>
          <div className="tabs" role="group" aria-label="Report sections">{(['overview', 'related', 'discussion'] as const).map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name === 'overview' ? 'Overview & next steps' : name === 'related' ? 'Related work' : 'Discussion'}</button>)}</div>
          {tab === 'overview' && <div className="report-grid"><div>
            <article className="panel"><h3>Verified metadata</h3><ul className="evidence-list">{report.facts.map(fact => <li key={fact.text}><span>{fact.text}</span><ExternalLink href={fact.source}>Source</ExternalLink></li>)}</ul><div className="labels">{report.issue.labels.map(label => <span className="label" key={label}>{label}</span>)}</div><p className="muted">Created {date(report.issue.createdAt)} · Updated {date(report.issue.updatedAt)}</p></article>
            <article className="panel"><h3>Issue description</h3><p className="source-note">Original source text; claims have not been independently verified.</p><pre className="source-text">{report.issue.body || 'No description provided.'}</pre><ExternalLink href={report.issue.url}>Read on GitHub</ExternalLink></article>
            <article className="panel"><h3>Possible causes to investigate</h3><p className="source-note">Keyword-based suggestions. Not a verified root cause.</p>{report.hypotheses.length === 0 ? <p>No heuristic matched. This does not rule out a defect; investigate manually.</p> : report.hypotheses.map(h => <div className="hypothesis" key={h.title}><span className="warning-label">{h.status}</span><h4>{h.title}</h4><blockquote>{h.evidence}</blockquote><ExternalLink href={h.source}>Evidence source</ExternalLink><p>{h.nextStep}</p></div>)}</article>
          </div><aside><article className="panel steps-panel"><p className="eyebrow">YOUR NEXT MOVE</p><h3>A practical debugging plan</h3><ol className="next-steps">{report.nextSteps.map(step => <li key={step}>{step}</li>)}</ol></article></aside></div>}
          {tab === 'related' && <article className="panel"><h3>Potentially related issues & pull requests</h3><p className="source-note">Matches are candidates, not confirmed dependencies, duplicates, or fixes.</p><p className="query">Search: {report.searchQuery}</p>{report.related.length ? <div className="table-scroll"><table><thead><tr><th>Candidate</th><th>Type</th><th>Status</th></tr></thead><tbody>{report.related.map(item => <tr key={item.url}><td><ExternalLink href={item.url}>#{item.number} {item.title}</ExternalLink></td><td>{item.kind}</td><td>{item.state}</td></tr>)}</tbody></table></div> : <p>No candidates available in this bounded search. Check the warnings below before drawing conclusions.</p>}</article>}
          {tab === 'discussion' && <article className="panel"><h3>Discussion excerpts</h3><p className="source-note">First 30 comments at most, rendered as plain text for safety.</p>{report.comments.length ? report.comments.map(comment => <article className="comment" key={comment.id}><div className="comment-heading"><strong>@{comment.author}</strong><time dateTime={comment.createdAt}>{date(comment.createdAt)}</time></div><pre className="source-text">{comment.body || 'Empty comment.'}</pre><ExternalLink href={comment.url}>View comment</ExternalLink></article>) : <p>No comments included. Check the warnings below for retrieval limitations.</p>}</article>}
          <details className="panel limitations" open><summary>Scope, limitations & retrieval warnings</summary><ul>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
        </section>}
      </main>
      <footer><span>Issue Investigator</span><p>Read-only. Evidence-linked. Human judgment required.</p><span>Built for curious developers.</span></footer>
    </div>
  );
}
