#!/usr/bin/env node
// Verificação de ponta a ponta do fluxo de exemplo do PDF (passos 1 a 7) contra a infra do Docker.
//   node scripts/verificar-fluxo.mjs
// Confere a infra, cria um banco descartável (bm_fluxo) com btree_gist, migra e popula, sobe a API
// com FakeGateway e FakeLlm roteirizado (apps/api/scripts/api-fluxo.ts, sem chaves), manda as
// mensagens pelo webhook com o segredo e confere tudo pela própria API. No fim encerra a API e
// apaga o banco e o db do Redis usados. Nada sai da máquina.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');
const DB = process.env.FLUXO_DB ?? 'bm_fluxo';
const REDIS_DB = process.env.FLUXO_REDIS_DB ?? '7';
const PORT = process.env.FLUXO_PORT ?? '3355';
const DATE = '2030-03-09'; // sábado
const PG = 'boramarca-postgres-1';
const REDIS = 'boramarca-redis-1';
const SECRET = randomBytes(24).toString('hex');
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: 'development',
  LOG_LEVEL: 'warn',
  PORT,
  DATABASE_URL: `postgres://boramarca:boramarca@localhost:5440/${DB}`,
  REDIS_URL: `redis://localhost:6390/${REDIS_DB}`,
  EVOLUTION_BASE_URL: '',
  EVOLUTION_API_KEY: '',
  LLM_PRIMARY_API_KEY: '',
  LLM_FALLBACK_API_KEY: '',
  TRANSCRIBE_API_KEY: '',
  PUSH_PROVIDER: 'fake',
  WHATSAPP_WEBHOOK_SECRET: SECRET,
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  DECISION_DEADLINE_MINUTES: '1',
  FLUXO_DATE: DATE,
};

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(
    `${cond ? 'OK   ' : 'FALHA'} ${msg}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`,
  );
  if (!cond) failures++;
  return cond;
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} falhou:\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
};
const psql = (db, sql) =>
  run('docker', ['exec', PG, 'psql', '-U', 'boramarca', '-d', db, '-c', `"${sql}"`]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 120_000, what = 'condição') {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch((e) => {
      if (e?.fatal) throw e;
      return null;
    });
    if (v) return v;
    if (Date.now() > end) throw new Error(`tempo esgotado esperando ${what}`);
    await sleep(500);
  }
}
const at = (hhmm) => {
  // America/Sao_Paulo é UTC-3 sem horário de verão desde 2019.
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2030, 2, 9, h + 3, m)).toISOString();
};
const phone = () => `+55119${String(randomInt(0, 1e8)).padStart(8, '0')}`;

let token = '';
async function call(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: r.status, json, text };
}
const must = async (method, path, body) => {
  const r = await call(method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${r.text}`);
  return r.json;
};

let instance = '';
let seq = randomInt(1, 1e9);
/** Mensagem recebida no formato da Evolution (messages.upsert), pelo webhook com o segredo. */
const receive = (fromPhone, text, pushName, secret = SECRET) =>
  call(
    'POST',
    `/v1/webhooks/whatsapp/${instance}`,
    {
      event: 'messages.upsert',
      instance,
      date_time: new Date().toISOString(),
      data: {
        key: {
          remoteJid: `${fromPhone.slice(1)}@s.whatsapp.net`,
          fromMe: false,
          id: `VERIF${++seq}`,
        },
        pushName,
        message: { conversation: text },
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
    { 'x-boramarca-webhook-secret': secret },
  );
const conversationOf = async (p) =>
  (await must('GET', '/v1/conversations?limit=200')).items.find((c) => c.clientPhone === p);
const outTo = async (p) => {
  const c = await conversationOf(p);
  if (!c) return [];
  const msgs = (await must('GET', `/v1/conversations/${c.id}/messages?limit=100`)).items;
  return msgs.filter((m) => m.direction === 'out' && m.providerMessageId).reverse();
};
const clock = (hhmm) => must('POST', '/__fluxo/relogio', { hhmm });

let api;
function stopApi() {
  if (!api || api.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F']);
  else api.kill('SIGTERM');
}
function cleanup() {
  stopApi();
  try {
    psql('boramarca', `drop database if exists ${DB} with (force)`);
  } catch (e) {
    console.error(String(e));
  }
  try {
    run('docker', ['exec', REDIS, 'redis-cli', '-n', REDIS_DB, 'flushdb']);
  } catch (e) {
    console.error(String(e));
  }
}

async function main() {
  // 0. Infra de pé (não sobe nem derruba nada: ver docs/verificacao-final.md).
  const ps = run('docker', [
    'compose',
    '-p',
    'boramarca',
    'ps',
    '--format',
    '"{{.Service}} {{.Health}}"',
  ]);
  for (const s of ['postgres', 'redis', 'evolution'])
    if (!ok(new RegExp(`${s} healthy`).test(ps), `infra: ${s} saudável`))
      throw new Error('Infra fora do ar: rode `pnpm dev:infra`.');

  // Banco limpo.
  psql('boramarca', `drop database if exists ${DB} with (force)`);
  psql('boramarca', `create database ${DB}`);
  psql(DB, 'create extension if not exists btree_gist');
  run('docker', ['exec', REDIS, 'redis-cli', '-n', REDIS_DB, 'flushdb']);
  console.log(
    run('pnpm', ['--filter', '@boramarca/api', 'db:migrate'], { cwd: root, env }).split('\n').pop(),
  );
  console.log(
    run('pnpm', ['--filter', '@boramarca/api', 'db:seed'], { cwd: root, env })
      .split('\n')
      .slice(-2)
      .join('\n'),
  );

  // API.
  api = spawn('pnpm', ['exec', 'tsx', 'scripts/api-fluxo.ts'], {
    cwd: apiDir,
    env,
    shell: process.platform === 'win32',
  });
  api.stdout.on('data', (d) => process.stdout.write(`  [api] ${d}`));
  api.stderr.on('data', (d) => process.stdout.write(`  [api:err] ${d}`));
  await waitFor(
    async () => {
      if (api.exitCode !== null) throw Object.assign(new Error('a API saiu'), { fatal: true });
      return (await call('GET', '/health')).status === 200;
    },
    180_000,
    'a API',
  );
  ok(true, `API de pé em ${BASE}`);

  // Profissional novo pela API (cadastro como o app faz).
  const proPhone = phone();
  await must('POST', '/v1/auth/otp/request', { phone: proPhone });
  const login = await must('POST', '/v1/auth/otp/verify', { phone: proPhone, code: '123456' });
  token = login.accessToken;
  ok(login.isNewUser === true, 'login com código de desenvolvimento cria conta nova');
  const me = await must('GET', '/v1/me');
  const service = await must('POST', '/v1/services', {
    name: 'Sessão',
    durationMin: 50,
    priceCents: 15000,
  });
  await must('PUT', '/v1/working-hours', {
    items: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start: '08:00',
      end: '18:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
    })),
  });
  await must('POST', '/v1/whatsapp/session', { riskAccepted: true });
  await must('GET', '/v1/whatsapp/qr');
  await waitFor(
    async () => (await must('GET', '/v1/whatsapp/status')).status === 'connected',
    60_000,
    'WhatsApp simulado conectar',
  );
  instance = `bm-${me.professional.id}`;
  ok(true, `WhatsApp simulado conectado (${instance})`);

  // Segredo do webhook.
  ok(
    (await receive(phone(), 'oi', 'X', 'segredo-errado-0000')).status === 401,
    'webhook com segredo errado -> 401',
  );

  // Carlos com horário hoje às 15h.
  await clock('09:00');
  const carlosPhone = phone();
  const carlos = await must('POST', '/v1/clients', { name: 'Carlos Pereira', phone: carlosPhone });
  const appt = await must('POST', '/v1/appointments', {
    clientId: carlos.id,
    serviceIds: [service.id],
    startsAt: at('15:00'),
  });

  // 1–2. 14:02 Carlos cancela.
  await clock('14:02');
  ok(
    (await receive(carlosPhone, 'não vou conseguir ir hoje às 15h', 'Carlos')).status === 200,
    'passo 1: webhook de Carlos aceito (200)',
  );
  const [toCarlos] = await waitFor(
    async () => {
      const o = await outTo(carlosPhone);
      return o.length ? o : null;
    },
    150_000,
    'resposta a Carlos',
  );
  ok(
    toCarlos.text === 'Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?',
    'passo 2: resposta a Carlos enviada',
    toCarlos.text,
  );
  const cancelled = await must('GET', `/v1/appointments/${appt.id}`);
  ok(
    cancelled.status === 'cancelled',
    'passo 2: horário das 15h de Carlos cancelado',
    cancelled.status,
  );
  const carlosConv = await conversationOf(carlosPhone);
  const carlosIn = (await must('GET', `/v1/conversations/${carlosConv.id}/messages`)).items.find(
    (m) => m.direction === 'in',
  );
  ok(
    carlosIn?.aiNote === 'Entendi como: cancelamento do horário de hoje às 15h',
    'passo 2: nota "Entendi como" gravada',
    carlosIn?.aiNote,
  );

  // 3–4. 14:05 Fulano pede horário à tarde -> Decisão.
  await clock('14:05');
  const fulanoPhone = phone();
  ok(
    (await receive(fulanoPhone, 'tem horário hoje à tarde?', 'Fulano')).status === 200,
    'passo 3: webhook de Fulano aceito (200)',
  );
  const decision = await waitFor(
    async () => (await must('GET', '/v1/decisions?status=pending')).items[0],
    150_000,
    'a Decisão',
  );
  ok(decision.type === 'novo_horario', 'passo 4: Decisão criada (novo_horario)', decision.question);
  ok(
    (await outTo(fulanoPhone)).length === 0,
    'passo 4: nada marcado nem prometido a Fulano antes da resposta',
  );

  // 5. "Pode, mas marca daqui 15 minutos."
  const ans = await call('POST', `/v1/decisions/${decision.id}/answer`, {
    text: 'Pode, mas marca daqui 15 minutos.',
    via: 'voice',
  });
  ok(ans.status === 200, 'passo 5: resposta do profissional aceita', ans.status);
  ok(
    ans.json?.spokenConfirmation === 'Marquei Fulano hoje às 14h20.',
    'passo 5: confirmação falada',
    ans.json?.spokenConfirmation,
  );
  ok(
    ans.json?.appointment?.startsAt === at('14:20') &&
      ans.json?.appointment?.status === 'scheduled',
    'passo 5: agendamento às 14h20',
    ans.json?.appointment?.startsAt,
  );
  ok(
    ans.json?.decision?.status === 'resolved' && ans.json?.decision?.resolvedVia === 'voice',
    'passo 5: Decisão resolvida por voz',
    ans.json?.decision?.status,
  );

  // 6. Fulano recebe a confirmação.
  const toFulano = await waitFor(
    async () => (await outTo(fulanoPhone)).find((m) => m.text.includes('14h20')),
    150_000,
    'confirmação a Fulano',
  );
  ok(Boolean(toFulano), 'passo 6: confirmação enviada a Fulano pela guarda', toFulano.text);
  const day = await must('GET', `/v1/agenda?date=${DATE}`);
  const dayJson = JSON.stringify(day);
  ok(dayJson.includes(at('14:20')), 'passo 6: agenda do dia mostra 14h20');

  // 7. Sem resposta no prazo -> "Já te confirmo!", Decisão continua pendente, nada marcado.
  const beltranoPhone = phone();
  await receive(beltranoPhone, 'quero marcar às 16h', 'Beltrano');
  const d7 = await waitFor(
    async () =>
      (await must('GET', '/v1/decisions?status=pending')).items.find((d) => d.id !== decision.id),
    150_000,
    'Decisão do passo 7',
  );
  ok(
    /Beltrano quer horário hoje às 16h/.test(d7.question),
    'passo 7: Decisão criada para Beltrano',
    d7.question,
  );
  console.log('  ... esperando o prazo (DECISION_DEADLINE_MINUTES=1)');
  const hold = await waitFor(
    async () => (await outTo(beltranoPhone))[0],
    240_000,
    '"Já te confirmo!"',
  );
  ok(hold.text === 'Já te confirmo!', 'passo 7: mensagem neutra no prazo esgotado', hold.text);
  const still = (await must('GET', '/v1/decisions?status=pending')).items.find(
    (d) => d.id === d7.id,
  );
  ok(Boolean(still), 'passo 7: Decisão continua pendente');
  const after = JSON.stringify(await must('GET', `/v1/agenda?date=${DATE}`));
  ok(!after.includes(at('16:00')), 'passo 7: nada marcado às 16h por tempo esgotado');
  // O horário deixa de estar livre -> a Decisão expira e o cliente é avisado.
  await must('POST', '/v1/appointments', {
    newClient: { name: 'Outra', phone: phone() },
    serviceIds: [service.id],
    startsAt: at('16:20'),
  });
  const expired = await waitFor(
    async () => (await outTo(beltranoPhone))[1],
    150_000,
    'aviso de expiração',
  );
  ok(
    /não está mais disponível/.test(expired.text),
    'passo 7: Decisão expira quando o horário é ocupado e o cliente é avisado',
    expired.text,
  );
  const late = await call('POST', `/v1/decisions/${d7.id}/answer`, { optionId: 'sim', via: 'app' });
  ok(late.status === 409, 'passo 7: responder depois de expirada -> 409', late.status);
}

const started = Date.now();
try {
  await main();
} catch (e) {
  failures++;
  console.error(`FALHA ${e instanceof Error ? e.message : e}`);
} finally {
  cleanup();
}
console.log(
  `\n${failures ? `${failures} FALHA(S)` : 'TUDO OK'} em ${Math.round((Date.now() - started) / 1000)} s`,
);
process.exit(failures ? 1 : 0);
