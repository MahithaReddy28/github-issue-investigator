# GitHub Issue Investigator

A read-only Next.js + TypeScript application for investigating **public GitHub issues**. Paste an issue URL to collect metadata, discussion excerpts, keyword-related issues and pull requests, and a source-linked Markdown report.

> **Validation pending:** Application and test files are committed, but the connector could not write `.github/workflows/ci.yml`. No CI runs or passing checks are verified. Add the supplied workflow manually on `feature/issue-investigator`, or run the checks below locally before merging or deploying.

## Capabilities

| Capability | Scope |
| --- | --- |
| Issue overview | Title, status, labels, author, dates, and description |
| Discussion | First 30 comments, with original-source links |
| Related work | Up to 8 keyword-matched issues or pull requests in the same public repository; one broader fallback search when appropriate |
| Investigation | Explicitly unverified, keyword-based hypotheses and next debugging steps |
| Export | Download an escaped Markdown report |
| Safety | Public-repository checks, strict URL validation, GitHub-only upstream host, redirect rejection, timeouts, and server-side credentials |

This is **not an AI diagnosis engine**. It does not execute repository code, inspect source files or PR diffs, verify fixes, or infer a confirmed root cause. No paid AI provider is needed.

## Local setup

Use Node.js 22 or 24 and npm:

```bash
git clone https://github.com/MahithaReddy28/github-issue-investigator.git
cd github-issue-investigator
git checkout feature/issue-investigator
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave `GITHUB_TOKEN` empty initially. Unauthenticated GitHub requests work for public repositories, subject to rate limits. For authenticated quota, configure a dedicated read-only, public-repository-only token in `.env.local` or your hosting provider's secret environment settings. Never paste credentials into browser inputs, chat, or committed source. Never prefix the variable with `NEXT_PUBLIC_`.

Dependencies use compatible ranges. This branch has no generated lockfile because no dependency installation has run through this connector. After a successful local install, review and commit `package-lock.json`, then use `npm ci` for reproducible installs. The supplied workflow also uploads its resolved lockfile once installed and running. Check dependency security advisories before public production use.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
# Lint, types, tests and build together:
npm run check
```

Tests mock GitHub. Live API behavior and browser interactions still need manual validation. A committed test file is not proof of a passing test.

To enable CI, create `.github/workflows/ci.yml` on the feature branch using the workflow supplied in chat, then inspect its run for the exact PR commit. It covers lint, types, unit tests, production build, a production-server smoke test, and dependency audit. The failed workflow-write cause was not identified; do not assume CI is installed.

## Deployment on Vercel

Review the pull request and run all checks first. Merge it yourself when satisfied; the assistant does not merge automatically.

Import `MahithaReddy28/github-issue-investigator` into Vercel as a Next.js project. Select Node.js 22.x or 24.x, use `npm run build`, and retain the framework's default output settings. Use `main` as the production branch after merging. For a preview before merge, configure Git integration to build the feature branch or PR.

Start without a token. If needed, add `GITHUB_TOKEN` as a server environment variable and redeploy. Vercel supplies the actual deployment URL after a successful deployment; no deployment has been performed by the assistant.

The app has a server endpoint and **cannot run on GitHub Pages/static-only hosting**. Other Node hosts can run `npm run build` followed by `npm start`.

## Public-hosting precautions

The endpoint has best-effort per-process limits of 20 requests per minute and 2 concurrent investigations. This is not distributed rate limiting; serverless instances do not share counters. Configure host-level WAF/rate limits or deployment protection before admitting untrusted public traffic. Cross-origin browser requests are rejected, but this is not authentication and does not stop direct clients. A shared GitHub token has a shared quota.

Only a repository explicitly reported public by GitHub is accepted before retrieving its issue. As additional defense, use only a public-access token; never deploy with a token that can read private repositories. The app does not persist reports or log credentials, but hosting platforms may retain normal request logs. Review hosting privacy and retention settings.

Descriptions and comments render as React-escaped plain text, not executable HTML or Markdown. Search keywords are alphanumeric and repository-scoped. Cancelling stops the browser request; started upstream work may continue until timeout.

## Retrieval limits

Issue descriptions are capped at 16,000 characters, comments at 6,000 characters each, and discussion at the first 30 comments. Partial failures and truncation appear in the report. Search may be incomplete or rate-limited; no result does not prove no related work exists. Candidates are not verified links, duplicates, or fixes.

GitHub requests use its default REST API version. Review its version lifecycle before long-term production use. Redirects are rejected; renamed repositories may require their current canonical URL.

## Manual acceptance checks

| Scenario | Expected result |
| --- | --- |
| Public issue URL | Source-linked metadata, report sections, Markdown download |
| Private or missing issue | Safe error without private content |
| Pull request entered as an issue | Validation error |
| Invalid host or URL | Rejected without contacting arbitrary servers |
| GitHub rate limit or timeout | Safe error or explicit partial-results warning |
| Narrow search with no candidates | One broader search, disclosed in warnings |
| Mobile and keyboard navigation | Usable form, visible focus, accessible status messages |

## References

Official documentation consulted September 25, 2026:

| Reference | Link |
| --- | --- |
| Next.js installation | https://nextjs.org/docs/app/getting-started/installation |
| Next.js 16.2 release | https://nextjs.org/blog/next-16-2 |
| GitHub REST versioning | https://docs.github.com/en/rest/about-the-rest-api/api-versions |
