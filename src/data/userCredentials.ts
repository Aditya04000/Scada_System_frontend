/**
 * userCredentials.ts
 * ---------------------------------------------------------------
 * Account management, backed by the API.
 *
 * This module used to be the credentials store. It held an array of accounts in
 * localStorage under `ctrl_hvac_user_credentials_v1`, with each password kept in
 * the `passwordHash` field as readable text, and `authenticateUser()` signed
 * somebody in by comparing two strings in the browser. That arrangement had no
 * security property at all: the password list was readable from the devtools
 * console, and because the check ran client-side, anyone could authenticate as
 * an ADMIN by editing the array.
 *
 * The replacement keeps every function name and every call site's result shape,
 * so the screens above did not need restructuring — the only change visible to
 * them is that these are now `async`. Behind each one:
 *
 *   - Passwords are bcrypt digests in Postgres. Nothing here can read one,
 *     because no endpoint returns one.
 *   - authenticateUser() posts to /api/auth/login, where the comparison happens
 *     against the digest, under a rate limit and an account lockout.
 *   - The session lives in an HTTP-only cookie the browser will not hand to
 *     JavaScript, so there is no longer a token for this file to hold.
 *
 * DEFAULT_USERS is gone. The two demo accounts it seeded had the passwords
 * `admin123` and `operator123` compiled into the bundle; the server's seed
 * script now creates the equivalent accounts with generated passwords printed
 * once to the console at setup, and both of those old strings are on the
 * password validator's banned list.
 */

import { UserAccount, UserRole } from '../types';
import {
  authApi,
  errorMessage,
  isApiError,
  toUserAccount,
  usersApi,
  type SignedInUser,
} from '../services/api';

/** Every function here returns this, exactly as the localStorage version did. */
interface Result {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------

/**
 * Mirrors server/src/lib/validation.ts. Duplicated deliberately, and only for
 * the message: it lets the form reject a four-character password as the operator
 * types instead of after a round-trip. The server re-checks everything and is
 * the only authority — if these two ever drift, the server wins and the operator
 * sees its message instead of this one.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULE_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`;

/** Returns a message to show, or null when the password looks acceptable. */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 200) return 'Password must be 200 characters or fewer.';
  if (!/[a-z]/i.test(password)) return 'Password must contain at least one letter.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  return null;
}

// ---------------------------------------------------------------
// Known sign-in addresses on this browser
// ---------------------------------------------------------------

const RECENT_EMAILS_KEY = 'becs_recent_signins_v1';
const RECENT_EMAILS_MAX = 6;

/** Shape the login screen's account chips render. */
export interface KnownAccount {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Addresses that have successfully signed in on this browser.
 *
 * The login screen shows these as the "PREVIOUS / KNOWN USER IDs" chips. They
 * used to come from getRegisteredUsers(), which meant the sign-in page listed
 * every account in the plant along with its privilege level to anybody who could
 * load the page — a free map of which address to attack. It also cannot work any
 * more even in principle: /api/users is admin-only, so there is nothing to read
 * before signing in.
 *
 * What is stored here is one thing per entry: an address that already signed in
 * successfully on this machine, which is what a browser's own autofill would
 * remember anyway. It is a convenience cache and never a source of truth — no
 * decision is made from it, no password is in it, and clearing it costs the
 * operator two keystrokes. On a shared terminal it can be emptied with
 * forgetKnownAccounts().
 */
export function getKnownAccounts(): KnownAccount[] {
  try {
    const raw = localStorage.getItem(RECENT_EMAILS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is { email: string; role: UserRole } =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { email?: unknown }).email === 'string' &&
          ((entry as { role?: unknown }).role === 'ADMIN' || (entry as { role?: unknown }).role === 'OPERATOR')
      )
      .slice(0, RECENT_EMAILS_MAX)
      .map((entry) => ({ id: `known-${entry.email}`, email: entry.email, role: entry.role }));
  } catch {
    return [];
  }
}

function rememberKnownAccount(email: string, role: UserRole): void {
  try {
    const existing = getKnownAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase());
    const next = [{ email, role }, ...existing.map((a) => ({ email: a.email, role: a.role }))].slice(
      0,
      RECENT_EMAILS_MAX
    );
    localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota. Losing the convenience list is harmless.
  }
}

/** Drops a remembered address — used when the server says it no longer exists. */
function forgetKnownAccount(email: string): void {
  try {
    const next = getKnownAccounts()
      .filter((a) => a.email.toLowerCase() !== email.toLowerCase())
      .map((a) => ({ email: a.email, role: a.role }));
    localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function forgetKnownAccounts(): void {
  try {
    localStorage.removeItem(RECENT_EMAILS_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------
// Reading accounts
// ---------------------------------------------------------------

/**
 * Every account in this installation. ADMIN only — the server returns 403 to an
 * operator, which is why the credentials panel is already gated behind an admin
 * check before it renders.
 */
export async function getRegisteredUsers(): Promise<UserAccount[]> {
  const users = await usersApi.list();
  return users.map(toUserAccount);
}

// ---------------------------------------------------------------
// Creating and modifying accounts
// ---------------------------------------------------------------

export async function registerUser(
  email: string,
  password: string,
  role: UserRole,
  name?: string
): Promise<{ success: boolean; error?: string; user?: UserAccount }> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const policyProblem = checkPasswordPolicy(password);
  if (policyProblem) return { success: false, error: policyProblem };

  try {
    const created = await usersApi.create({
      email: cleanEmail,
      password,
      role,
      name: name?.trim() || (role === 'ADMIN' ? 'System Administrator' : 'Operator Staff'),
    });
    return { success: true, user: toUserAccount(created) };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

/**
 * Sets somebody else's password — an administrator reset, so no current password
 * is required. The server hashes it, clears any lockout, and signs that account
 * out of every browser it was open in, because a reset that leaves the old
 * session working has not actually taken effect.
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<Result> {
  const policyProblem = checkPasswordPolicy(newPassword);
  if (policyProblem) return { success: false, error: policyProblem };

  try {
    await usersApi.update(userId, { password: newPassword });
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

/**
 * Changes a role. The server refuses to demote the last active administrator or
 * to let an admin remove their own rights, so the error text here is worth
 * showing rather than swallowing — it explains why the toggle did not move.
 */
export async function updateUserRole(userId: string, newRole: UserRole): Promise<Result> {
  try {
    await usersApi.update(userId, { role: newRole });
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export async function deleteUserAccount(userId: string): Promise<Result> {
  try {
    await usersApi.remove(userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

/**
 * The text behind "VIEW CREDENTIALS FILE" and "DOWNLOAD .TXT FILE".
 *
 * Both buttons still work and the export still lists every account with its
 * role, status and sign-in history. The one line that changed is the password,
 * which now reads "[redacted — bcrypt digest, not exportable]" — and that is a
 * statement of fact rather than a policy choice, since only the digest exists.
 */
export async function exportCredentialsFileText(): Promise<string> {
  return usersApi.exportText();
}

// ---------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------

/**
 * Signs in against the API.
 *
 * Two behaviours from the old version are deliberately not reproduced. It used
 * to answer "No account found with this email" versus "Incorrect password",
 * which tells an attacker which addresses are worth guessing at; the server now
 * returns one message for both. And it had no limit on attempts, so the whole
 * password space was available at the speed of a for-loop; the login route is
 * rate-limited per address and locks an account after repeated failures.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: SignedInUser }> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await authApi.login(cleanEmail, password);
    rememberKnownAccount(user.email, user.role);
    return { success: true, user };
  } catch (err) {
    // A chip for an account that has since been deleted should stop appearing.
    if (isApiError(err) && err.status === 401) forgetKnownAccount(cleanEmail);
    return { success: false, error: errorMessage(err) };
  }
}

/** Ends the session server-side, which revokes it rather than just forgetting it. */
export async function signOut(): Promise<void> {
  await authApi.logout();
}

/**
 * The account this browser's cookie belongs to, or null.
 *
 * Called on load so a valid session survives a refresh without a retyped
 * password, and so the app knows the caller's role before rendering anything
 * that depends on it.
 */
export async function getCurrentUser(): Promise<SignedInUser | null> {
  return authApi.me();
}
