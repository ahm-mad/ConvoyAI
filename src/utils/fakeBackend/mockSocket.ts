// Demo-mode bridge for realtime events. Dispatches a window CustomEvent that
// src/contexts/SocketContext.tsx listens for in place of a real Socket.IO connection — same event
// names / payload shapes the Node backend's Socket.IO server actually emits (api_contract §4.2), so
// Grid.tsx / Assets.tsx / GlobalPacketListener.tsx don't need to know whether an update came from a
// real socket or the simulator.
export function triggerMockSocketEvent(eventName, data) {
  if (typeof window !== 'undefined') {
    const customEvent = new CustomEvent('MSW_SOCKET_EVENT', {
      detail: { eventName, data },
    });
    window.dispatchEvent(customEvent);
  }
}
