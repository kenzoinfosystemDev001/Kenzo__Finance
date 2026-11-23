/**
 * Turns a mail-transport failure into a message that is safe to show a user.
 * Raw server text and credentials are never returned: only a category and a
 * short instruction. The code is what gets logged.
 */
export interface MailFailure {
  code: string;
  message: string;
}

const UNREACHABLE_CODES = new Set(['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'EDNS', 'ENOTFOUND']);

export function describeMailFailure(error: unknown): MailFailure {
  const e = (error ?? {}) as { code?: string; responseCode?: number };

  if (e.code === 'REJECTED_RECIPIENT') {
    return { code: e.code, message: 'The mail server did not accept the recipient address. Check the address and try again.' };
  }
  if (e.code === 'EAUTH') {
    return {
      code: e.code,
      message: 'The mail server rejected the sign-in details. An administrator must check the SMTP user and password settings.',
    };
  }
  if (e.code && UNREACHABLE_CODES.has(e.code)) {
    return { code: 'UNREACHABLE', message: 'Could not reach the mail server. Try again in a few minutes.' };
  }
  if (typeof e.responseCode === 'number' && e.responseCode >= 500) {
    return {
      code: `SMTP_${e.responseCode}`,
      message: `The mail server refused the message (code ${e.responseCode}). Check the recipient address and try again.`,
    };
  }
  if (typeof e.responseCode === 'number' && e.responseCode >= 400) {
    return { code: `SMTP_${e.responseCode}`, message: 'The mail server is busy or temporarily refused the message. Try again shortly.' };
  }
  return { code: 'UNKNOWN', message: 'The email could not be sent. Try again; if it keeps failing, contact an administrator.' };
}
