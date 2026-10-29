// Sign-in rules (Microsoft Entra ID) — pure, shared by the proxy, the auth routes and the data layer. Copied from Keystone
// (R-038/R-039, docs/SOCLE.md) and adapted to Crucible: the user is matched by Microsoft object id, else by e-mail among the
// accounts the administrator created; roles and scopes come from Crucible's own role assignments (docs/spec/01 §4), not from
// the token. An e-mail listed in CRUCIBLE_ADMIN_EMAILS gets an account with the administrator role at its first sign-in
// (bootstrap of a new database, N-4).
import { sortRoles, type RoleKey } from '@/config/roles';

/** The claims Crucible reads from an Entra ID token (v2.0 ID token). */
export interface IdentityClaims {
  /** Entra object id of the user — the stable link to the Microsoft account. */
  oid?: unknown;
  sub?: unknown;
  tid?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
  name?: unknown;
  /** Optional claim "email domain owner verified": false when the `email` claim is not verified by its domain owner. */
  xms_edov?: unknown;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

/** A normalised e-mail address (trimmed, lower case) or null when the value is not shaped like one. */
export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

/**
 * The e-mail that identifies the person: `email`, else `preferred_username`, else `upn` (Entra UPNs are addresses). An
 * `email` the token marks as unverified (`xms_edov: false`) is not used. Only tokens of the EPC2i tenant reach this
 * (issuer and tenant are checked), and the person is then bound to the Microsoft object id, not to the e-mail.
 */
export function emailFromClaims(claims: IdentityClaims): string | null {
  const email = claims.xms_edov === false || claims.xms_edov === 'false' ? null : normaliseEmail(claims.email);
  return email ?? normaliseEmail(claims.preferred_username) ?? normaliseEmail(claims.upn);
}

/** Why a sign-in is refused (the code is shown on the sign-in page through SIGN_IN_ERROR). */
export type SignInRefusal =
  | 'no_email' // the token carries no usable e-mail
  | 'unknown_user' // no Crucible account has this e-mail
  | 'no_role' // the account holds no valid role assignment
  | 'inactive' // the account is deactivated
  | 'account_mismatch'; // the account is already linked to another Microsoft account

/** Refusal reasons as written in the audit trail (EN source strings). */
export const SIGN_IN_REFUSAL_LABEL: Record<SignInRefusal, string> = {
  no_email: 'No e-mail in the token',
  unknown_user: 'Unknown e-mail',
  no_role: 'No Crucible role',
  inactive: 'Account deactivated',
  account_mismatch: 'Linked to another Microsoft account',
};

/** Errors of the sign-in flow that are not identity refusals. */
export type SignInFailure = 'expired' | 'state' | 'provider' | 'token' | 'config' | 'session' | 'failed';

export type SignInError = SignInRefusal | SignInFailure;

/** Sign-in page message per error code (EN source strings). */
export const SIGN_IN_ERROR: Record<SignInError, string> = {
  no_email: 'Your Microsoft account did not provide an e-mail address.',
  unknown_user: 'Your e-mail address has no Crucible account. Ask the Crucible administrator to create it.',
  no_role: 'No Crucible role is assigned to your account. Ask the Crucible administrator to assign you a role.',
  inactive: 'Your Crucible account is deactivated.',
  account_mismatch: 'This Crucible account is already linked to another Microsoft account.',
  expired: 'The sign-in took too long. Please try again.',
  state: 'The sign-in could not be verified. Please try again.',
  provider: 'Microsoft sign-in was cancelled or refused.',
  token: 'The Microsoft sign-in response could not be verified.',
  config: 'Sign-in is not configured. Contact IT.',
  session: 'Your session has ended. Please sign in again.',
  failed: 'The sign-in failed. Please try again.',
};

export const isSignInError = (v: unknown): v is SignInError => typeof v === 'string' && Object.hasOwn(SIGN_IN_ERROR, v);

/** An Crucible account as the sign-in sees it. */
export interface SignInAccount {
  userId: string;
  entraObjectId: string | null;
  active: boolean;
  /** Roles of the account's valid assignments. */
  roles: RoleKey[];
}

export type SignInDecision =
  | { ok: true; userId: string | null; createAdmin: boolean; roles: RoleKey[] }
  | { ok: false; reason: SignInRefusal };

/**
 * Who signs in. `byObjectId` = the account already linked to this Microsoft account (stable even when the e-mail changes);
 * otherwise the account of the token e-mail. An unknown e-mail listed in `adminEmails` gets a new administrator account
 * (`createAdmin`).
 */
export function decideSignIn(input: {
  oid: string;
  email: string | null;
  byObjectId: SignInAccount | null;
  byEmail: SignInAccount | null;
  adminEmails: readonly string[];
}): SignInDecision {
  let account = input.byObjectId;
  if (!account) {
    if (!input.email) return { ok: false, reason: 'no_email' };
    account = input.byEmail;
    if (!account) return input.adminEmails.includes(input.email) ? { ok: true, userId: null, createAdmin: true, roles: ['admin'] } : { ok: false, reason: 'unknown_user' };
    if (account.entraObjectId && account.entraObjectId !== input.oid) return { ok: false, reason: 'account_mismatch' };
  }
  if (!account.active) return { ok: false, reason: 'inactive' };
  const roles = sortRoles(account.roles);
  if (!roles.length) return { ok: false, reason: 'no_role' };
  return { ok: true, userId: account.userId, createAdmin: false, roles };
}

/** Where to land after sign-in: a same-origin absolute path only (no scheme, no "//host", no control characters). */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 2048) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/';
  if (raw === '/sign-in' || raw.startsWith('/sign-in?') || raw.startsWith('/api/auth/')) return '/';
  return raw;
}

/** Refusal of "View as" outside the demo mode, and of the role switch outside the Entra mode (EN source strings). */
export const VIEW_AS_REFUSED = 'View as is only available in demo mode';
export const ROLE_SWITCH_REFUSED = 'You do not hold this role';
export const ROLE_SWITCH_DEMO = 'Use View as to change persona in demo mode';

/** Sign-in routes and page. */
export const AUTH_PATHS = {
  signIn: '/api/auth/sign-in',
  callback: '/api/auth/callback',
  signOut: '/api/auth/sign-out',
  page: '/sign-in',
} as const;

/** Health probe(s), reachable without a session (load balancer, monitoring). */
export const HEALTH_PATHS = ['/api/health'] as const;
/**
 * Paths that carry their own secret token instead of a session (CR-071, CR-072): a device's events and kiosk page, a calendar
 * subscription read by Outlook. Each one checks its token against the stored hash and opens nothing else.
 */
export const TOKEN_PATHS = ['/api/occupancy', '/kiosk', '/api/calendar'] as const;

const STATIC_FILE_RE = /\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|css|js|map|txt|webmanifest)$/i;

/**
 * Paths served without a session in Entra mode: the sign-in page and routes, health probes, Next's build assets and
 * static files of /public. Everything else needs a session (the proxy redirects, getViewer() re-checks).
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === AUTH_PATHS.page || pathname.startsWith('/api/auth/')) return true;
  if (HEALTH_PATHS.some((h) => pathname === h || pathname.startsWith(h + '/'))) return true;
  if (TOKEN_PATHS.some((h) => pathname === h || pathname.startsWith(h + '/'))) return true;
  if (pathname.startsWith('/_next/')) return true;
  // Static files: a single path segment with a file extension (public/ is flat: favicon.ico, *.svg).
  return /^\/[^/]+$/.test(pathname) && STATIC_FILE_RE.test(pathname);
}
