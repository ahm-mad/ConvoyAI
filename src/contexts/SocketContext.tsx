'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

// Replaces Pusher (see backend_frontend_sync/api_contract/API_CONTRACT.md §4). Node has no Pusher at all: one Socket.IO
// connection per logged-in user, auth'd with the same JWT as the REST API, joined server-side into a
// `user:{id}` room. Unlike Pusher there is no per-resource channel/event name — the server emits a
// small fixed set of events (packet:initial / device:value / alarm:state / notification:new /
// dashboard:update / building:update) and the resource id travels INSIDE the payload. So each event is
// bound to the socket exactly once (module-level, not per dashboard/product/asset id) and this context
// dispatches to whichever per-id callback is currently registered — consumers still get a Pusher-style
// "subscribe to this one id" API (bindDashboardEvent(dashboardId, cb) etc.), just implemented on top of
// a single shared listener instead of a new socket binding per id.

// Read fresh at call time (initializeSocket), NOT once at module load — this same "compute isDemo
// once at import time" pattern in the old PusherContext.tsx meant a user who logs in as the demo
// account in a tab that had no/a different `user` in localStorage yet (e.g. the first login of the
// session) got silently misclassified as a real user: Pusher would open a real (unauthenticated,
// harmless-looking) connection that never received the demo simulator's events; Socket.IO makes the
// same mistake loud instead — a real `io()` connection with no real JWT fails the handshake with
// connect_error "Invalid token". Fixed here by reading localStorage inside initializeSocket(), after
// login has actually written the current user.
function readIsDemo(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;
  } catch {
    return false;
  }
}

type EventCallback = (data: any) => void;

// Company-wide fleet events (API_CONTRACT §4.6). Unlike the per-id events above these have several
// independent consumers, so each event keeps a Set of listeners. 'fleet:connected' is a local signal
// (not a server event) raised on every socket (re)connect so consumers can refetch what they missed —
// the server never replays events.
export type FleetEventName =
  | 'fleet:position'
  | 'geofence:event'
  | 'trip:update'
  | 'fleet:changed'
  | 'fleet:status_summary'
  | 'fleet:connected';
const fleetListeners = new Map<FleetEventName, Set<EventCallback>>();

function dispatchFleet(name: FleetEventName, data: any) {
  fleetListeners.get(name)?.forEach(cb => cb(data));
}

interface SocketContextValue {
  initializeSocket: (userId: string | number) => void;
  bindAllInitialPacketEvents: (
    products: Array<{ id: string | number }>,
    callback: EventCallback
  ) => void;
  bindDashboardEvent: (dashboardId: string | number, callback: EventCallback) => void;
  bindBuildingEvent: (buildingId: string | number, callback: EventCallback) => void;
  // device:value fires once per ingested packet ({ deviceId, productId, cleanedPacket }) — consumers
  // (e.g. the packet-history table) filter by productId the same way bindDashboardEvent filters by
  // dashboardId; see src/screens/ManageDevice.tsx.
  bindDeviceValueEvent: (productId: string | number, callback: EventCallback) => void;
  unbindDashboardEvent: (dashboardId: string | number) => void;
  unbindBuildingEvent: (buildingId: string | number) => void;
  unbindDeviceValueEvent: (productId: string | number) => void;
  // Returns the unsubscribe function.
  subscribeFleetEvent: (event: FleetEventName, callback: EventCallback) => () => void;
  disconnectSocket: (userId: string | number) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

const socketRef: { current: Socket | null } = { current: null };
let isMock = false;

// Per-id routing tables the single shared listener for each event dispatches through.
const dashboardCallbacks = new Map<string, EventCallback>();
const buildingCallbacks = new Map<string, EventCallback>();
const deviceValueCallbacks = new Map<string, EventCallback>();
// packet:initial has one consumer (GlobalPacketListener) filtering by a whole product-id set, not a
// single id, so it gets its own slot rather than a per-id map.
let packetInitialProductIds = new Set<string>();
let packetInitialCallback: EventCallback | null = null;

const listenersBound = { current: false };

function dispatchDashboardUpdate(data: any) {
  const cb = dashboardCallbacks.get(String(data?.dashboardId));
  cb?.(data);
}
function dispatchBuildingUpdate(data: any) {
  const cb = buildingCallbacks.get(String(data?.buildingId));
  cb?.(data);
}
function dispatchDeviceValue(data: any) {
  const cb = deviceValueCallbacks.get(String(data?.productId));
  cb?.(data);
}
function dispatchPacketInitial(data: any) {
  if (packetInitialCallback && packetInitialProductIds.has(String(data?.productId))) {
    packetInitialCallback(data);
  }
}

// Demo-mode bridge: the fake backend dispatches the SAME event names/payload shapes the real Socket.IO
// server would (src/utils/fakeBackend/mockSocket.ts + controllers.ts), as a window CustomEvent, so the
// dispatch tables above don't need to know whether the data came from a real socket or the simulator.
function handleMockSocketEvent(event: any) {
  const { eventName, data } = event.detail;
  if (eventName === 'dashboard:update') dispatchDashboardUpdate(data);
  else if (eventName === 'building:update') dispatchBuildingUpdate(data);
  else if (eventName === 'packet:initial') dispatchPacketInitial(data);
  else if (eventName === 'device:value') dispatchDeviceValue(data);
}

function bindSharedListenersOnce() {
  if (listenersBound.current) return;
  listenersBound.current = true;

  if (isMock) {
    if (typeof window !== 'undefined') {
      window.removeEventListener('MSW_SOCKET_EVENT', handleMockSocketEvent);
      window.addEventListener('MSW_SOCKET_EVENT', handleMockSocketEvent);
    }
    return;
  }

  const socket = socketRef.current;
  if (!socket) return;
  socket.on('dashboard:update', dispatchDashboardUpdate);
  socket.on('building:update', dispatchBuildingUpdate);
  socket.on('packet:initial', dispatchPacketInitial);
  socket.on('device:value', dispatchDeviceValue);
  socket.on('fleet:position', data => dispatchFleet('fleet:position', data));
  socket.on('geofence:event', data => dispatchFleet('geofence:event', data));
  socket.on('trip:update', data => dispatchFleet('trip:update', data));
  socket.on('fleet:changed', data => dispatchFleet('fleet:changed', data));
  // Counts-only status change, at most once a minute (flows/07 §13.4, A9).
  socket.on('fleet:status_summary', data => dispatchFleet('fleet:status_summary', data));
  socket.on('connect', () => dispatchFleet('fleet:connected', {}));
  socket.on('connect_error', err => {
    // err.message: "Authentication required" | "Invalid token" — no refresh-token flow exists today
    // (see UserContext), so this is surfaced for debugging rather than acted on automatically.
    console.error('[Socket] connect_error:', err.message);
  });
}

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  function initializeSocket(userId: string | number) {
    if (socketRef.current) return; // already initialized

    isMock = readIsDemo();
    console.log(`[Socket] Initializing for userId: ${userId} (Demo: ${isMock})`);

    if (isMock) {
      socketRef.current = { mock: true } as unknown as Socket; // sentinel: no real socket.io connection
      bindSharedListenersOnce();
      return;
    }

    const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    const token = localStorage.getItem('token') || '';
    socketRef.current = io(apiOrigin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    bindSharedListenersOnce();
  }

  function bindAllInitialPacketEvents(
    products: Array<{ id: string | number }>,
    callback: EventCallback
  ) {
    packetInitialProductIds = new Set((products ?? []).map(p => String(p.id)));
    packetInitialCallback = callback;
  }

  function bindDashboardEvent(dashboardId: string | number, callback: EventCallback) {
    dashboardCallbacks.set(String(dashboardId), callback);
  }

  function bindBuildingEvent(buildingId: string | number, callback: EventCallback) {
    buildingCallbacks.set(String(buildingId), callback);
  }

  function bindDeviceValueEvent(productId: string | number, callback: EventCallback) {
    deviceValueCallbacks.set(String(productId), callback);
  }

  function subscribeFleetEvent(event: FleetEventName, callback: EventCallback) {
    const set = fleetListeners.get(event) ?? new Set<EventCallback>();

    set.add(callback);
    fleetListeners.set(event, set);

    return () => {
      set.delete(callback);
    };
  }

  function unbindDashboardEvent(dashboardId: string | number) {
    dashboardCallbacks.delete(String(dashboardId));
  }

  function unbindBuildingEvent(buildingId: string | number) {
    buildingCallbacks.delete(String(buildingId));
  }

  function unbindDeviceValueEvent(productId: string | number) {
    deviceValueCallbacks.delete(String(productId));
  }

  return (
    <SocketContext.Provider
      value={{
        initializeSocket,
        bindAllInitialPacketEvents,
        bindDashboardEvent,
        bindBuildingEvent,
        bindDeviceValueEvent,
        unbindDashboardEvent,
        unbindBuildingEvent,
        unbindDeviceValueEvent,
        subscribeFleetEvent,
        disconnectSocket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext) as SocketContextValue;

export function disconnectSocket(userId: string | number) {
  if (!socketRef.current) return;
  if (typeof window !== 'undefined') {
    window.removeEventListener('MSW_SOCKET_EVENT', handleMockSocketEvent);
  }
  if (!isMock) {
    console.log(`[Socket] Disconnecting for userId: ${userId}`);
    socketRef.current.disconnect();
  }
  socketRef.current = null;
  listenersBound.current = false;
  dashboardCallbacks.clear();
  buildingCallbacks.clear();
  deviceValueCallbacks.clear();
  fleetListeners.clear();
  packetInitialProductIds = new Set();
  packetInitialCallback = null;
}
