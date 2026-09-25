# GitHub Issue Investigator

A read-only Next.js + TypeScript application for investigating **public GitHub issues**. Paste an issue URL to collect metadata, discussion excerpts, keyword-related issues and pull requests, and a source-linked Markdown report.

## What it does

| Capability | Scope |
| --- | --- |
| Issue overview | Title, status, labels, author, dates, and description |
| Discussion | First 30 comments, with original-source links |
| Related work | Up to 8 keyword-matched issues or pull requests in the same public repository; one broader fallback search when appropriate |
| Investigation | Explicitly unverified, keyword-based hypotheses and next debugging steps |
| Export | Download an escaped Markdown report |
| Safety | Public-repository checks, strict URL validation, GitHub-only upstream host, redirect rejection, request timeouts, and server-side credentials |

This is **not an AI diagnosis engine**. It does not execute repository code, inspect source files or PR diffs, verify fixes, or infer a confirmed root cause. No paid AI provider is needed.

## Local setup

Use Node.js 22 or 24 and npm. From a checkout of this branch:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave `GITHUB_TOKEN` empty initially. Unauthenticated GitHub requests work for public repositories, subject to GitHub rate limits. For a higher authenticated quota, configure a dedicated read-only, public-repository-only token in `.env.local` or your hosting provider's secret environment settings. Never paste it into an issue URL, browser input, chat, or committed source file. Never prefix it with `NEXT_PUBLIC_`.

Dependency versions use compatible ranges. This initial branch does not contain an automatically generated lockfile because the build is created through a file-based connector. CI uploads its resolved `package-lock.json` as an artifact. Review and commit that lockfile, then use `npm ci` for reproducible installs. Check dependencies and security advisories before public production use.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
# Or run everything:
npm run check
```

The GitHub Actions workflow runs these checks and a production-server smoke test. A workflow file is not proof of passing tests: inspect the run associated with the exact PR commit before merging. Unit tests mock GitHub; live API behavior and browser interactions still need manual validation.

## Deployment on Vercel

Review the pull request and wait for passing checks. Merge it yourself when satisfied; the assistant does not merge automatically.

In Vercel, import `MahithaReddy28/github-issue-investigator` as a Next.js project. Set Node.js to 22.x or 24.x, use `npm run build`, and keep the framework's default output settings. Use `main` as the production branch after merging. For a preview before merge, select the feature branch or configure Vercel Git integration to build the PR.

Start without a token. If needed, add `GITHUB_TOKEN` as a server environment variable and redeploy. Vercel provides the actual deployment URL after a successful deployment; no URL is preassigned in this project.

This project uses a server endpoint and **cannot be deployed as a GitHub Pages/static-only site**. Other hosts can run `npm run build` followed by `npm start`.

## Public-hosting precautions

The endpoint has a best-effort, per-process limit of 20 requests per minute and 2 concurrent investigations. This is not a distributed rate limiter; serverless instances do not share counters. Configure host-level WAF/rate limits or deployment protection before admitting untrusted public traffic. Cross-origin browser requests are rejected, but that is not authentication and does not stop direct API clients. A shared optional GitHub token also has a shared quota.

Only a repository explicitly reported public by GitHub is accepted before retrieving its issue. As additional defense, use only a public-access token; do not deploy with a token that can read private repositories. The app does not persist reports or log credentials, but the hosting platform may retain ordinary request logs. Review hosting privacy and retention settings.

Descriptions and comments render as React-escaped plain text, not HTML or executable Markdown. Source-derived search keywords are alphanumeric and repository-scoped. Cancellation stops the browser request; already-started upstream work may continue until its timeout.

## Retrieval limits

Issue descriptions are capped at 16,000 characters, individual comments at 6,000 characters, and discussion at the first 30 comments. Partial failures and truncation appear in the report. GitHub search is bounded and may be incomplete or rate-limited; no result does not prove that no related work exists. Related results are not verified links, duplicates, or fixes.

GitHub REST requests use GitHub's default API version. Review its version lifecycle before long-term production use. The current implementation intentionally avoids following redirects; renamed repositories may need their current canonical URL.

## Manual acceptance checks

| Scenario | Expected result |
| --- | --- |
| Public issue URL | Source-linked metadata, report sections, and downloadable Markdown |
| Private or missing issue | Safe error without private content |
| Pull request entered as an issue | Validation error |
| Invalid host or URL | Rejected without contacting arbitrary servers |
| GitHub rate limit or timeout | Clear error or explicit partial-results warning |
| Narrow search with no candidates | One broader search, clearly disclosed |
| Mobile and keyboard navigation | Usable form, visible focus, accessible status messages |

## References

Official documentation consulted September 25, 2026:

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js 16.2 release](https://nextjs.org/blog/next-16-2)
- [GitHub REST API versioning](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
