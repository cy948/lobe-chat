import {
  LocalSystemApiName,
  LocalSystemIdentifier,
  LocalSystemManifest,
} from '@lobechat/builtin-tool-local-system';

import { deviceProxy } from '../deviceProxy';
import { type ServerRuntimeRegistration } from './types';

const LOCAL_SYSTEM_OBSERVATION_TIMEOUT_MS = 30_000;
const LOCAL_SYSTEM_GATEWAY_CALLER_TIMEOUT_BUFFER_MS = 15_000;
const LOCAL_SYSTEM_SERVER_CALLER_TIMEOUT_BUFFER_MS = 30_000;

const normalizeObservationTimeout = (timeout: unknown): number => {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout)) {
    return LOCAL_SYSTEM_OBSERVATION_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.trunc(timeout), 0), LOCAL_SYSTEM_OBSERVATION_TIMEOUT_MS);
};

export const localSystemRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId) {
      throw new Error('userId is required for Local System device proxy execution');
    }
    if (!context.activeDeviceId) {
      throw new Error('activeDeviceId is required for Local System device proxy execution');
    }

    const proxy: Record<string, (args: any) => Promise<any>> = {};

    for (const api of LocalSystemManifest.api) {
      proxy[api.name] = async (args: any) => {
        const observationTimeout =
          api.name === LocalSystemApiName.runCommand
            ? normalizeObservationTimeout(args?.timeout)
            : undefined;
        const gatewayCallerTimeout =
          observationTimeout === undefined
            ? undefined
            : observationTimeout + LOCAL_SYSTEM_GATEWAY_CALLER_TIMEOUT_BUFFER_MS;
        const serverCallerTimeout =
          observationTimeout === undefined
            ? undefined
            : observationTimeout + LOCAL_SYSTEM_SERVER_CALLER_TIMEOUT_BUFFER_MS;

        const toolCall = {
          apiName: api.name,
          arguments: JSON.stringify(args),
          identifier: LocalSystemIdentifier,
        };

        if (gatewayCallerTimeout === undefined || serverCallerTimeout === undefined) {
          return deviceProxy.executeToolCall(
            { deviceId: context.activeDeviceId!, userId: context.userId! },
            toolCall,
          );
        }

        return deviceProxy.executeToolCall(
          { deviceId: context.activeDeviceId!, userId: context.userId! },
          toolCall,
          gatewayCallerTimeout,
          serverCallerTimeout,
        );
      };
    }

    return proxy;
  },
  identifier: LocalSystemIdentifier,
};
