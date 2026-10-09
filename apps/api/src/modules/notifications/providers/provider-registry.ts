import { Injectable, Logger } from '@nestjs/common';
import type { PushProviderName } from '@prisma/client';
import { env } from '../../../config/env';
import { ExpoPushProvider } from './expo.provider';
import { FcmPushProvider } from './fcm.provider';
import { MockPushProvider } from './mock.provider';
import type { PushProvider } from './push-provider';

/** Resolves which transport handles a device token. Unconfigured providers are never faked in production. */
@Injectable()
export class PushProviderRegistry {
  private readonly logger = new Logger(PushProviderRegistry.name);
  private readonly providers = new Map<PushProviderName, PushProvider>();
  private readonly mock = new MockPushProvider();

  constructor() {
    const enabled = new Set(env().PUSH_PROVIDERS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
    if (enabled.has('MOCK') && env().NODE_ENV !== 'production') this.providers.set('MOCK', this.mock);
    if (enabled.has('EXPO')) this.providers.set('EXPO', new ExpoPushProvider(env().EXPO_ACCESS_TOKEN));
    if (enabled.has('FCM')) {
      if (env().FCM_PROJECT_ID && env().FCM_SERVICE_ACCOUNT_JSON) {
        this.providers.set('FCM', new FcmPushProvider(env().FCM_PROJECT_ID!, env().FCM_SERVICE_ACCOUNT_JSON!));
      } else {
        this.logger.error('FCM enabled but FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT_JSON are missing; FCM disabled');
      }
    }
  }

  /** Test hook. */
  register(provider: PushProvider): void {
    this.providers.set(provider.name, provider);
  }

  resolve(tokenProvider: PushProviderName): PushProvider | null {
    if (env().PUSH_FORCE_MOCK && env().NODE_ENV !== 'production') return this.mock;
    return this.providers.get(tokenProvider) ?? null;
  }

  enabled(): PushProviderName[] {
    return [...this.providers.keys()];
  }
}
