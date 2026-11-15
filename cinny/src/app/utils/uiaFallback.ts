/**
 * Registration steps that Diddy cannot show itself run on the homeserver's own page, the "fallback"
 * of the Matrix spec (client-server API, "Fallback" under user-interactive authentication): the
 * page is opened with the session, the user completes it there, and the client then sends the
 * request again with only `{ session }`.
 *
 * reCAPTCHA belongs here in the desktop app: its site keys are bound to the server's domains and
 * refuse Diddy's `http://localhost` page.
 */

/** Steps the registration form handles in the app. Everything else goes to the server's page. */
const NATIVE_STAGES = [
  'm.login.registration_token',
  'org.matrix.msc3231.login.registration_token',
  'm.login.terms',
  'm.login.email.identity',
  'm.login.dummy',
];

const RECAPTCHA = 'm.login.recaptcha';

/** True when `stage` has to be completed on the homeserver's page. */
export const needsFallback = (stage: string, inDesktopApp: boolean): boolean => {
  if (NATIVE_STAGES.includes(stage)) return false;
  if (stage === RECAPTCHA) return inDesktopApp;
  return true;
};

/** Address of the server's page for one step of a registration session. */
export const uiaFallbackUrl = (baseUrl: string, stage: string, session: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/_matrix/client/v3/auth/${encodeURIComponent(
    stage
  )}/fallback/web?session=${encodeURIComponent(session)}`;

/** Short title of a step, for the dialog. */
export const fallbackStageTitle = (stage: string): string => {
  if (stage === RECAPTCHA) return 'Prove you are human';
  if (stage === 'm.login.terms') return 'Accept the terms';
  return 'One more step';
};

/** Host of a homeserver address, for "Create an account on matrix.org". */
export const serverLabel = (server: string): string => {
  try {
    return new URL(server.includes('://') ? server : `https://${server}`).host || server;
  } catch {
    return server;
  }
};
