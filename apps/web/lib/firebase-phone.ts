import { ApiCallError } from './api';

// Firebase Authentication by phone sends the login SMS when the API answers `provider: "firebase"`
// to POST /auth/otp/request. Literal process.env reads: Next inlines them at build time.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = () => Object.values(config).every(Boolean);

/** Turns the code typed by the person into a Firebase ID token for POST /auth/firebase. */
export type ConfirmCode = (code: string) => Promise<string>;

const TEXT: Record<string, string> = {
  'auth/invalid-verification-code': 'Código errado. Confira e tente de novo.',
  'auth/code-expired': 'Código expirado. Peça um novo.',
  'auth/session-expired': 'Código expirado. Peça um novo.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/invalid-phone-number': 'Número inválido. Informe o celular com DDD.',
  'auth/missing-phone-number': 'Número inválido. Informe o celular com DDD.',
  'auth/captcha-check-failed':
    'Não deu para confirmar que você não é um robô. Recarregue a página e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com o servidor. Tente de novo em instantes.',
};

/** Firebase errors (`auth/...` codes) → ApiCallError with a clear pt-BR message. */
export function firebaseError(err: unknown): ApiCallError {
  const code = (err as { code?: unknown } | null)?.code;
  const key = typeof code === 'string' ? code : '';
  return new ApiCallError(
    0,
    key || 'FIREBASE',
    TEXT[key] ?? 'Envio de código indisponível no momento. Tente de novo em instantes.',
  );
}

/**
 * Sends the SMS through Firebase (invisible reCAPTCHA rendered in `container`, an element or its id). Without the
 * NEXT_PUBLIC_FIREBASE_* variables the panel cannot log in: same message as the API's 503.
 */
export async function sendFirebaseCode(
  phone: string,
  container: HTMLElement | string,
): Promise<ConfirmCode> {
  if (!firebaseConfigured())
    throw new ApiCallError(503, 'OTP_UNAVAILABLE', 'Envio de código indisponível no momento');
  const [{ getApps, initializeApp }, fb] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const auth = fb.getAuth(getApps()[0] ?? initializeApp(config));
  auth.languageCode = 'pt-BR';
  const verifier = new fb.RecaptchaVerifier(auth, container, { size: 'invisible' });
  try {
    const confirmation = await fb.signInWithPhoneNumber(auth, phone, verifier);
    return async (code) => {
      try {
        const { user } = await confirmation.confirm(code);
        const idToken = await user.getIdToken();
        // Our API session is what counts; the Firebase one is not kept in this browser.
        await fb.signOut(auth);
        return idToken;
      } catch (err) {
        throw firebaseError(err);
      }
    };
  } catch (err) {
    throw firebaseError(err);
  } finally {
    // A fresh widget per send (a used or failed one cannot be rendered again in the same element).
    verifier.clear();
  }
}
