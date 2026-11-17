import type { AlexaSettingsPatch, AlexaSettingsResponse } from '@boramarca/shared';
import { reply } from './mock/util';

/**
 * Alexa (Ajustes → Alexa): link status, Voice Monkey announcements and unlink. The link itself is
 * made in the Alexa app (account linking); the Voice Monkey token is write-only.
 */
export interface AlexaData {
  getSettings(): Promise<AlexaSettingsResponse>;
  updateSettings(body: AlexaSettingsPatch): Promise<AlexaSettingsResponse>;
  unlink(): Promise<AlexaSettingsResponse>;
}

let state: AlexaSettingsResponse = {
  linked: true,
  voiceMonkeyEnabled: false,
  voiceMonkeyDevice: null,
  voiceMonkeyTokenSet: false,
};

export const mockAlexa: AlexaData = {
  getSettings: () => reply(state),
  async updateSettings({ voiceMonkeyToken, ...rest }) {
    state = {
      ...state,
      ...rest,
      ...(voiceMonkeyToken !== undefined ? { voiceMonkeyTokenSet: voiceMonkeyToken !== null } : {}),
    };
    return reply(state);
  },
  async unlink() {
    state = { ...state, linked: false };
    return reply(state);
  },
};
