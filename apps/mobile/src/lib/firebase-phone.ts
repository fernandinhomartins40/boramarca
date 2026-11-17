import { getAuth, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';
import { DataError } from '@/data/errors';
import type { PhoneSignIn } from '@/data/api';

// Loaded only when EXPO_PUBLIC_FIREBASE_AUTH=true (src/data/index.ts).
const TEXT: Record<string, string> = {
  'auth/invalid-verification-code': 'Código errado. Confira o SMS e tente de novo.',
  'auth/code-expired': 'Código expirado. Peça um novo.',
  'auth/session-expired': 'Código expirado. Peça um novo.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/invalid-phone-number': 'Número inválido. Confira o DDD e o celular.',
  'auth/missing-phone-number': 'Número inválido. Confira o DDD e o celular.',
  'auth/network-request-failed': 'Sem conexão. Confira a internet e tente de novo.',
};

/** Firebase errors (`auth/...`) → DataError with a clear pt-BR message. */
export function firebaseError(err: unknown): DataError {
  const code = (err as { code?: unknown } | null)?.code;
  const key = typeof code === 'string' ? code : 'FIREBASE';
  return new DataError({
    statusCode: 400,
    code: key,
    message: TEXT[key] ?? 'Envio de código indisponível no momento. Tente de novo em instantes.',
  });
}

/** Sends the SMS with Firebase; the returned function turns the typed code into an ID token. */
export const firebasePhoneSignIn: PhoneSignIn = async (phone) => {
  const auth = getAuth();
  let confirmation: Awaited<ReturnType<typeof signInWithPhoneNumber>>;
  try {
    confirmation = await signInWithPhoneNumber(auth, phone);
  } catch (err) {
    throw firebaseError(err);
  }
  return async (code) => {
    try {
      const cred = await confirmation.confirm(code);
      if (!cred) throw { code: 'auth/session-expired' };
      const idToken = await cred.user.getIdToken();
      // Our API session is what counts; the Firebase one is not kept on the phone.
      await signOut(auth).catch(() => undefined);
      return idToken;
    } catch (err) {
      throw err instanceof DataError ? err : firebaseError(err);
    }
  };
};
