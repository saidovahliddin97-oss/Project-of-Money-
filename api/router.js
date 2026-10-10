// Vercel Functions adapter (Web-standard handlers). vercel.json rewrites
// /api/<path> to /api/router?__path=<path>; restore the original path here.
// Note: Vercel's free Hobby plan is for non-commercial use; see docs/DEPLOY.md.
import { handle } from '../server/handlers.js';

function restorePath(request) {
  const url = new URL(request.url);
  const original = url.searchParams.get('__path');
  if (original === null) return request;
  url.searchParams.delete('__path');
  url.pathname = '/api/' + original.replace(/^\/+/, '');
  return new Request(url, request);
}

export async function GET(request) {
  return handle(restorePath(request), process.env, { log: console.log });
}

export async function POST(request) {
  return handle(restorePath(request), process.env, { log: console.log });
}
