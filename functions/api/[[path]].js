// Cloudflare Pages Functions adapter: every /api/* request goes to the shared router.
import { handle } from '../../server/handlers.js';

export async function onRequest(context) {
  return handle(context.request, context.env, { log: console.log });
}
