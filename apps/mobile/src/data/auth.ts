import type {
  EmailCodeRequestBody,
  EmailCodeResponse,
  EmailCodeVerifyBody,
  SignupRequestBody,
  SignupVerifyBody,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
} from '@boramarca/shared';
import { DEMO_OTP, DEMO_PHONE } from './mock/fixtures';
import { fail, minutesFromNow, reply } from './mock/util';

/**
 * Phone login with a 6-digit code (prompt 01). Owner: agent B2; api implementation: D1 (which also
 * stores the tokens and refreshes them). Mock: any phone, code 123456; the demo phone
 * +55 11 98765-4321 is an existing account, any other phone is a new user (goes to sign-up).
 */
export interface AuthData {
  requestOtp(body: OtpRequestBody): Promise<OtpRequestResponse>;
  verifyOtp(body: OtpVerifyBody): Promise<OtpVerifyResponse>;
  /** Free sign-up: the code goes by e-mail (POST /auth/signup/request, /verify). */
  requestSignup(body: SignupRequestBody): Promise<EmailCodeResponse>;
  verifySignup(body: SignupVerifyBody): Promise<OtpVerifyResponse>;
  /** Login code to the account's confirmed e-mail (POST /auth/email-code/request, /verify). */
  requestEmailCode(body: EmailCodeRequestBody): Promise<EmailCodeResponse>;
  verifyEmailCode(body: EmailCodeVerifyBody): Promise<OtpVerifyResponse>;
  signOut(): Promise<void>;
}

const mockTokens = (isNewUser: boolean) => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  accessTokenExpiresAt: minutesFromNow(15),
  refreshTokenExpiresAt: minutesFromNow(60 * 24 * 30),
  isNewUser,
});
const mockCode = (code: string) => {
  if (code !== DEMO_OTP)
    fail(400, 'OTP_INVALID', 'Código errado. Confira o e-mail e tente de novo.');
};
const sentTo = (email: string) => ({
  ok: true as const,
  expiresInSeconds: 600,
  retryAfterSeconds: 60,
  email: email.replace(/^(.).*@/, '$1***@'),
});

export const mockAuth: AuthData = {
  async requestOtp() {
    return reply({ ok: true as const, expiresInSeconds: 300, retryAfterSeconds: 30 });
  },
  async verifyOtp(body) {
    if (body.code !== DEMO_OTP)
      fail(400, 'INVALID_CODE', 'Código errado. Confira o SMS e tente de novo.');
    return reply({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      accessTokenExpiresAt: minutesFromNow(15),
      refreshTokenExpiresAt: minutesFromNow(60 * 24 * 30),
      isNewUser: body.phone !== DEMO_PHONE,
    });
  },
  async requestSignup(body) {
    return reply(sentTo(body.email));
  },
  async verifySignup(body) {
    mockCode(body.code);
    return reply(mockTokens(true));
  },
  async requestEmailCode() {
    return reply(sentTo('demo@boramarca.com.br'));
  },
  async verifyEmailCode(body) {
    mockCode(body.code);
    return reply(mockTokens(body.phone !== DEMO_PHONE));
  },
  async signOut() {
    return reply(undefined);
  },
};
