import { api, ApiError } from "./api";

/**
 * Creating the taker profile (POST /takers/register → Taker with status PENDING) needs a
 * logged-in session. Sign Up does it immediately when Supabase returns a session (email
 * confirmation off). If it can't — confirmation still on, or the call failed — the details
 * are kept in localStorage and the taker shell finishes the job on first login.
 */
export interface TakerProfileInput {
  name?: string;
  phone?: string;
  intendedUse?: string;
}

const key = (email: string) =>
  `loopsoil:pending-taker:${email.trim().toLowerCase()}`;

export function savePendingProfile(
  email: string,
  profile: TakerProfileInput,
): void {
  try {
    localStorage.setItem(key(email), JSON.stringify(profile));
  } catch {
    // storage unavailable — registration falls back to the User record's name/phone
  }
}

function takePendingProfile(email: string): TakerProfileInput {
  try {
    const raw = localStorage.getItem(key(email));
    return raw ? (JSON.parse(raw) as TakerProfileInput) : {};
  } catch {
    return {};
  }
}

function clearPendingProfile(email: string): void {
  try {
    localStorage.removeItem(key(email));
  } catch {
    // ignore
  }
}

/** POST /takers/register. "Already registered" counts as success. */
export async function registerTakerProfile(
  profile: TakerProfileInput,
): Promise<void> {
  try {
    await api.post("/takers/register", profile);
  } catch (err) {
    if (err instanceof ApiError && err.code === "TAKER_EXISTS") return;
    throw err;
  }
}

/** First-login fallback: register using whatever Sign Up saved for this email. */
export async function completePendingRegistration(
  email: string,
): Promise<void> {
  await registerTakerProfile(takePendingProfile(email));
  clearPendingProfile(email);
}
