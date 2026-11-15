/**
 * Roteiro contra a API real usando a camada de dados do app (src/data/api.ts + src/lib/api):
 * login da Marina, agenda de hoje, resposta a uma decisão pendente (com o evento chegando pelo
 * WebSocket), renovação de token e exclusão de uma conta de teste nova criada aqui (nunca a da
 * Marina). Precisa da API rodando com o seed (apps/api/README.md) e do Node 22+ (WebSocket global).
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_API_URL=http://localhost:3334 npx tsx scripts/roteiro-api.ts
 */
import type { AuthTokens } from '@boramarca/shared';
import { createApiData } from '../src/data/api';
import { createApiClient, type TokenStore } from '../src/lib/api/client';
import { createRealtime, type SocketLike } from '../src/lib/realtime/socket';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3334';
const MARINA = '+5511900000001';
const CODE = '123456';

function session() {
  let tokens: AuthTokens | null = null;
  const store: TokenStore & { expiredCalls: number } = {
    expiredCalls: 0,
    get: () => tokens,
    set: (t) => (tokens = t),
    expired: () => {
      store.expiredCalls++;
      tokens = null;
    },
  };
  const client = createApiClient({ baseUrl: BASE, tokens: store });
  return { store, client, data: createApiData(client) };
}

function check(ok: unknown, what: string): asserts ok {
  if (!ok) throw new Error(`FALHOU: ${what}`);
  console.log(`ok  ${what}`);
}

/** Logs in; a resend cooldown (60 s) is fine, 123456 works outside production anyway. */
async function login(s: ReturnType<typeof session>, phone: string) {
  await s.data.auth.requestOtp({ phone, purpose: 'login' }).catch((e: Error) => {
    console.log(`    (pedido de código: ${e.message})`);
  });
  const res = await s.data.auth.verifyOtp({ phone, code: CODE });
  const { isNewUser, ...tokens } = res;
  s.store.set(tokens);
  return isNewUser;
}

const todayInSaoPaulo = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function main() {
  console.log(`API: ${BASE}`);

  // 1. Marina
  const marina = session();
  check((await login(marina, MARINA)) === false, 'login da Marina (conta existente)');
  const me = await marina.data.profile.getMe();
  check(me.professional.phone === MARINA, `GET /me: ${me.professional.name}`);

  // 2. agenda
  const date = todayInSaoPaulo();
  const day = await marina.data.agenda.getDay(date);
  check(
    day.date === date,
    `agenda de ${date}: ${day.appointments.length} agendamentos, ${day.summary.freeSlotsCount} vagas`,
  );

  // 3. renovação de token: access token inválido -> 401 -> /auth/refresh -> nova tentativa
  marina.store.set({ ...marina.store.get()!, accessToken: 'invalido' });
  const [a, b] = await Promise.all([
    marina.data.decisions.list('pending'),
    marina.data.profile.getMe(),
  ]);
  check(
    marina.store.get()!.accessToken !== 'invalido' && !!a && !!b,
    'renovação de token com duas chamadas simultâneas',
  );

  // 4. decisão pendente, com o WebSocket ligado
  const events: string[] = [];
  let wasOpen = false;
  let markOpen = () => undefined as void;
  const opened = new Promise<void>((resolve) => (markOpen = resolve));
  const rt = createRealtime({
    baseUrl: BASE,
    accessToken: marina.client.accessToken,
    refresh: marina.client.refresh,
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    onOpen: () => {
      wasOpen = true;
      markOpen();
    },
  });
  rt.subscribe(null, (e) => events.push(e.type));
  rt.start();
  await Promise.race([opened, new Promise((r) => setTimeout(r, 5000))]);
  check(wasOpen, 'WebSocket /v1/realtime conectado');

  const pending = a.items;
  if (!pending.length) {
    console.log('    (nenhuma decisão pendente no seed: rode pnpm db:seed para recriar)');
  } else {
    const d = pending[0]!;
    const option = d.options.find((o) => o.id !== 'nao') ?? d.options[0]!;
    const answered = await marina.data.decisions.answer(d.id, { optionId: option.id, via: 'app' });
    check(answered.decision.status === 'resolved', `decisão "${d.question}" -> ${option.label}`);
    console.log(`    fala: ${answered.spokenConfirmation}`);
    await new Promise((r) => setTimeout(r, 1500));
    check(
      events.includes('decision.resolved'),
      `evento decision.resolved recebido (${events.join(', ')})`,
    );
  }
  rt.stop();

  // 5. conta de teste nova: cadastro, aparelho, exclusão
  const phone = `+55119${String(Date.now()).slice(-8)}`;
  check(phone !== MARINA, `telefone de teste ${phone}`);
  const test = session();
  check((await login(test, phone)) === true, 'conta de teste nova (isNewUser)');
  await test.data.profile.updateMe({
    name: 'Roteiro D1',
    professions: ['outro'],
    salonName: 'Roteiro D1',
  });
  const device = await test.data.devices.register({
    pushToken: `ExponentPushToken[roteiro-${Date.now()}]`,
    platform: 'android',
  });
  check(!!device.id, 'POST /devices');
  await test.data.auth.signOut();
  check(true, 'DELETE /devices/:id no "Sair"');

  const testMe = await test.data.profile.getMe();
  check(testMe.professional.phone === phone, 'a conta a excluir é a de teste, não a da Marina');
  await test.data.auth.requestOtp({ phone, purpose: 'delete_account' }).catch(() => undefined);
  const deleted = await test.data.account.deleteMe({ code: CODE, origin: 'app' });
  check(deleted.ok, `DELETE /me (${deleted.completedAt})`);
  // the access JWT is stateless: GET /me no longer finds the account, and the refresh is refused
  const after = await test.data.profile.getMe().catch((e: { statusCode?: number }) => e);
  check((after as { statusCode?: number }).statusCode === 404, 'GET /me da conta excluída: 404');
  check(
    (await test.client.refresh()) === null && test.store.expiredCalls === 1,
    'refresh recusado depois da exclusão -> sessão encerrada (saída para boas-vindas)',
  );

  // a Marina continua lá
  check((await marina.data.profile.getMe()).professional.phone === MARINA, 'Marina intacta');
  console.log('\nRoteiro concluído.');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
