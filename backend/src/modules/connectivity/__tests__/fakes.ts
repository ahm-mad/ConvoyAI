import type {
  ConnectivityMqttStateLookup,
  ConnectivityPacketsLookup,
  ConnectivityProtocolsLookup,
  ConnectivityQueueLookup,
} from '../connectivity.service.js';

export function fakeProtocolsLookup(
  byName: Record<string, string> = {}
): ConnectivityProtocolsLookup {
  return {
    findByName: (name: string) => {
      const id = byName[name];
      return Promise.resolve(id === undefined ? undefined : { id });
    },
  };
}

export function fakePacketsLookup(
  byProtocolId: Record<string, { total: number; lastMessageAt: Date | null }> = {}
): ConnectivityPacketsLookup {
  return {
    countAndLatestByProtocolId: (protocolId: string) =>
      Promise.resolve(byProtocolId[protocolId] ?? { total: 0, lastMessageAt: null }),
  };
}

export function fakeQueueLookup(waitingCount = 0): ConnectivityQueueLookup {
  return { waitingCount: () => Promise.resolve(waitingCount) };
}

export function fakeMqttStateLookup(state?: {
  connected: boolean;
  reconnectsTotal: number;
  errorsTotal: number;
}): ConnectivityMqttStateLookup {
  return { read: () => Promise.resolve(state) };
}
