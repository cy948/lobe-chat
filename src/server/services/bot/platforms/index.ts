import type { PlatformBotClass } from '../types';
import { Discord } from './discord';
import { QQ } from './qq';
import { Telegram } from './telegram';

export const platformBotRegistry: Record<string, PlatformBotClass> = {
  discord: Discord,
  qq: QQ,
  telegram: Telegram,
};
