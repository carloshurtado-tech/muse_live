// @ts-check
import { readSession } from './session.js';
/** The signed-in user for this request (set by the middleware; re-read if absent). @param {any} context */
export async function who(context) {
  if (context.data && context.data.user !== undefined) return context.data.user;
  return readSession(context.request, context.env);
}
/** @param {any} u */
export function isAdmin(u) { return !!u && u.r === 'admin'; }
/** @param {any} u */
export function canWrite(u) { return !!u && u.r !== 'viewer'; }
