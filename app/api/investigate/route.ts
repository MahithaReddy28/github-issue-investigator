import 'server-only';
import { NextResponse } from 'next/server';
import { createGitHubClient, GitHubError } from '../../../lib/github';
import { investigate, toMarkdown } from '../../../lib/investigate';
import { ValidationError } from '../../../lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Best-effort per-process guard, NOT a distributed rate limiter.
// Enable your host's WAF/rate limit before allowing untrusted public traffic.
let windowStart = Date.now();
let requests = 0;
let active = 0;
const headers = { 'Cache-Control': 'no-store' };
function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new ValidationError('A JSON request body is required.');
  const reader = request.body.getReader();
  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new ValidationError('Request body must be no larger than 4 KB.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new ValidationError('Request body must be valid JSON.'); }
}

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return error('Use application/json.', 415);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return error('Cross-origin requests are not allowed.', 403);
  if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
  if (requests >= 20 || active >= 2) {
    return NextResponse.json({ error: 'Investigator is busy. Please retry in one minute.' }, {
      status: 429, headers: { ...headers, 'Retry-After': '60' },
    });
  }
  requests++;
  active++;
  try {
    const body = await readBody(request);
    if (typeof body !== 'object' || body === null || !('url' in body)) {
      throw new ValidationError('Provide an issue URL.');
    }
    const report = await investigate(body.url, createGitHubClient(process.env.GITHUB_TOKEN));
    return NextResponse.json({ report, markdown: toMarkdown(report) }, { headers });
  } catch (failure) {
    if (failure instanceof ValidationError) return error(failure.message, 400);
    if (failure instanceof GitHubError) return error(failure.message, failure.status);
    return error('Investigation failed unexpectedly. Please try again later.', 500);
  } finally { active--; }
}
