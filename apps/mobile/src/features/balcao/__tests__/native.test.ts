import type { WakeWordEngine } from '../engines';
import { createBalcaoSession, SPEAKER_LOST, type SessionDeps } from '../native/session';
import { brandOf, levelBars } from '../native/setup';
import { NativeSpeechToText, type RecognitionModule } from '../native/speechToText';
import { HoldableWakeWord, PorcupineWakeWord, isWakePhrase } from '../native/wakeWord';

describe('isWakePhrase (setup test without Porcupine)', () => {
  it.each(['Ei, Bora Marca', 'ei bora marca!', 'Hey Bora Marca', 'Éi, Bora Marca, quem é o próximo?'])(
    'accepts %s',
    (text) => expect(isWakePhrase(text)).toBe(true),
  );
  it.each([
    'bora marcar pra semana que vem?',
    'Bora marca então',
    'ei, bora marcar o corte?',
    'vamos marcar',
    'ei bora',
  ])('ignores everyday phrase %s', (text) => expect(isWakePhrase(text)).toBe(false));
});

describe('PorcupineWakeWord', () => {
  it('starts the manager and forwards detections', async () => {
    let detect = () => {};
    const manager = { start: jest.fn(async () => {}), stop: jest.fn(async () => {}) };
    const engine = new PorcupineWakeWord(async (onDetect) => {
      detect = onDetect;
      return manager;
    });
    const onWake = jest.fn();
    await engine.start(onWake);
    detect();
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(engine.simulated).toBe(false);
    await engine.stop();
    detect();
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(manager.stop).toHaveBeenCalled();
  });

  it('falls back to simulated (the "Falar" button) when Porcupine cannot start', async () => {
    const onError = jest.fn();
    const engine = new PorcupineWakeWord(async () => {
      throw new Error('invalid AccessKey');
    }, onError);
    await expect(engine.start(() => {})).resolves.toBeUndefined();
    expect(engine.simulated).toBe(true);
    expect(onError).toHaveBeenCalled();
  });
});

function fakeEngine() {
  const calls: string[] = [];
  let onWake: (() => void) | null = null;
  const engine: WakeWordEngine = {
    simulated: false,
    async start(fn) {
      calls.push('start');
      onWake = fn;
    },
    async stop() {
      calls.push('stop');
      onWake = null;
    },
  };
  return { engine, calls, wake: () => onWake?.() };
}

describe('HoldableWakeWord', () => {
  it('frees the microphone while held and listens again after release', async () => {
    const fake = fakeEngine();
    const { calls } = fake;
    const wake = new HoldableWakeWord(fake.engine);
    const onWake = jest.fn();
    await wake.start(onWake);
    expect(wake.started).toBe(true);
    await wake.hold();
    await wake.hold();
    await wake.release();
    expect(calls).toEqual(['start', 'stop']);
    await wake.release();
    expect(calls).toEqual(['start', 'stop', 'start']);
    fake.wake();
    expect(onWake).toHaveBeenCalledTimes(1);
    await wake.stop();
    expect(wake.started).toBe(false);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('does not listen when held before start', async () => {
    const { engine, calls } = fakeEngine();
    const wake = new HoldableWakeWord(engine);
    await wake.hold();
    await wake.start(() => {});
    expect(calls).toEqual([]);
    await wake.release();
    expect(calls).toEqual(['start']);
  });
});

function fakeRecognition(granted = true) {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const module = {
    start: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(async () => ({ granted })),
    getMicrophonePermissionsAsync: jest.fn(async () => ({ granted })),
    requestMicrophonePermissionsAsync: jest.fn(async () => ({ granted })),
    getSpeechRecognizerPermissionsAsync: jest.fn(async () => ({ granted })),
    requestSpeechRecognizerPermissionsAsync: jest.fn(async () => ({ granted })),
    addListener: jest.fn((event: string, fn: (e: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return {
        remove: () => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)),
      };
    }),
  };
  const emit = (event: string, e: unknown = null) => (listeners.get(event) ?? []).forEach((f) => f(e));
  const count = () => [...listeners.values()].reduce((n, l) => n + l.length, 0);
  return { module: module as unknown as RecognitionModule, raw: module, emit, count };
}

const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  results: [{ transcript, confidence: 1, segments: [] }],
});

describe('NativeSpeechToText', () => {
  it('listens in pt-BR, sends partials and one final result, and hands the mic back', async () => {
    const rec = fakeRecognition();
    const mic = { hold: jest.fn(async () => {}), release: jest.fn(async () => {}) };
    const stt = new NativeSpeechToText(rec.module, mic);
    const onPartial = jest.fn();
    const onResult = jest.fn();
    await stt.start({ onPartial, onResult });
    expect(rec.raw.start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'pt-BR' }));
    expect(mic.hold).toHaveBeenCalledTimes(1);
    rec.emit('result', result('si', false));
    rec.emit('result', result('sim', true));
    rec.emit('end');
    expect(onPartial).toHaveBeenCalledWith('si');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('sim');
    expect(mic.release).toHaveBeenCalledTimes(1);
    expect(rec.count()).toBe(0);
  });

  it('sends nothing on silence (the machine timer takes over)', async () => {
    const rec = fakeRecognition();
    const stt = new NativeSpeechToText(rec.module);
    const onResult = jest.fn();
    await stt.start({ onPartial: () => {}, onResult });
    rec.emit('nomatch');
    rec.emit('result', result('tarde demais', true));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('rejects without microphone permission', async () => {
    const rec = fakeRecognition(false);
    const stt = new NativeSpeechToText(rec.module);
    await expect(stt.start({ onPartial: () => {}, onResult: () => {} })).rejects.toThrow();
    expect(rec.raw.start).not.toHaveBeenCalled();
  });

  it('stop aborts and releases once', async () => {
    const rec = fakeRecognition();
    const mic = { hold: jest.fn(async () => {}), release: jest.fn(async () => {}) };
    const stt = new NativeSpeechToText(rec.module, mic);
    await stt.start({ onPartial: () => {}, onResult: () => {} });
    await stt.stop();
    await stt.stop();
    expect(rec.raw.abort).toHaveBeenCalledTimes(1);
    expect(mic.release).toHaveBeenCalledTimes(1);
  });
});

function sessionDeps(over: Partial<SessionDeps> = {}) {
  let running = false;
  const service = {
    start: jest.fn(() => {
      running = true;
    }),
    stop: jest.fn(() => {
      running = false;
    }),
    isRunning: () => running,
  };
  const wake = { started: true, hold: jest.fn(async () => {}), release: jest.fn(async () => {}) };
  const deps: SessionDeps = {
    service,
    wake,
    summary: jest.fn(async (moment) => ({ moment, speech: moment === 'open' ? 'Bom dia!' : 'Até amanhã!' })),
    say: jest.fn(async () => {}),
    setActive: jest.fn(),
    notify: jest.fn(),
    isForeground: () => true,
    ...over,
  };
  return { deps, service, wake };
}

describe('createBalcaoSession', () => {
  it('"Iniciar o balcão" starts the service and speaks the opening summary', async () => {
    const { deps, service } = sessionDeps();
    const session = createBalcaoSession(deps);
    await session.open();
    expect(service.start).toHaveBeenCalledWith('Bora Marca está ouvindo', expect.any(String), 'Pausar');
    expect(deps.setActive).toHaveBeenCalledWith(true);
    expect(deps.say).toHaveBeenCalledWith('Bom dia!');
    expect(session.running).toBe(true);
  });

  it('"Encerrar o balcão" stops the service and speaks the closing summary', async () => {
    const { deps, service } = sessionDeps();
    const session = createBalcaoSession(deps);
    await session.open();
    await session.close();
    expect(service.stop).toHaveBeenCalled();
    expect(deps.setActive).toHaveBeenLastCalledWith(false);
    expect(deps.say).toHaveBeenLastCalledWith('Até amanhã!');
  });

  it('follows the Balcão screen: opening starts the service, leaving closes it', async () => {
    const { deps, service } = sessionDeps();
    const session = createBalcaoSession(deps);
    session.onActiveChange(true, false);
    expect(service.start).toHaveBeenCalledTimes(1);
    session.onActiveChange(false, true);
    await Promise.resolve();
    expect(service.stop).toHaveBeenCalledTimes(1);
  });

  it('never starts the service from the background (Android 14+)', () => {
    const { deps, service } = sessionDeps({ isForeground: () => false });
    createBalcaoSession(deps).onActiveChange(true, false);
    expect(service.start).not.toHaveBeenCalled();
  });

  it('"Pausar" frees the microphone until the app comes back', () => {
    const { deps, service, wake } = sessionDeps();
    const session = createBalcaoSession(deps);
    session.onActiveChange(true, false);
    session.onServiceChange({ running: false, reason: 'paused' });
    expect(wake.hold).toHaveBeenCalled();
    expect(deps.setActive).toHaveBeenCalledWith(false);
    session.onActiveChange(true, false);
    expect(service.start).toHaveBeenCalledTimes(1);
    session.onForeground();
    expect(wake.release).toHaveBeenCalled();
    expect(service.start).toHaveBeenCalledTimes(2);
    expect(deps.setActive).toHaveBeenLastCalledWith(true);
  });

  it('warns and speaks when the Bluetooth speaker drops', () => {
    const { deps } = sessionDeps();
    const session = createBalcaoSession(deps);
    session.onRouteChange({ bluetooth: true, name: 'JBL Go 4' });
    session.onActiveChange(true, false);
    session.onRouteChange({ bluetooth: false, name: null });
    expect(deps.notify).toHaveBeenCalledWith(SPEAKER_LOST, 'danger');
    expect(deps.say).toHaveBeenCalledWith(SPEAKER_LOST);
    session.onRouteChange({ bluetooth: true, name: 'JBL Go 4' });
    expect(deps.notify).toHaveBeenLastCalledWith('JBL Go 4 conectada de novo.', 'success');
  });

  it('works without a service (iOS): only the summary', async () => {
    const { deps } = sessionDeps({ service: null });
    const session = createBalcaoSession(deps);
    await session.open();
    expect(session.running).toBe(false);
    expect(deps.say).toHaveBeenCalledWith('Bom dia!');
  });
});

describe('setup helpers', () => {
  it('detects the phone brand', () => {
    expect(brandOf('Xiaomi')).toBe('xiaomi');
    expect(brandOf('POCO')).toBe('xiaomi');
    expect(brandOf('samsung')).toBe('samsung');
    expect(brandOf('motorola')).toBe('motorola');
    expect(brandOf('Google')).toBe('other');
    expect(brandOf(null)).toBe('other');
  });

  it('maps the microphone volume to bars', () => {
    expect(levelBars(-2, 12)).toBe(0);
    expect(levelBars(5, 12)).toBe(6);
    expect(levelBars(10, 12)).toBe(12);
    expect(levelBars(20, 12)).toBe(12);
  });
});
