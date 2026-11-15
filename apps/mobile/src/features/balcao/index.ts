// Modo Balcão (prompts 07 e 08).
// Owner: agent C3 (interface, machine.ts, engines.ts) and wave 4 (native/: Porcupine, native
// recognition and media volume, plugged in with setBalcaoEngines).
export { BalcaoScreen } from './BalcaoScreen';
export { createBalcaoController, type BalcaoController } from './controller';
export * from './engines';
export * from './machine';
export { LOW_VOLUME, useBalcaoStore, type BalcaoState } from './store';
export { useBalcao } from './useBalcao';
