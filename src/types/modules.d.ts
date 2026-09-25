// Ambient declarations for third-party packages that ship no types.
// Keeps `noImplicitAny` / strict happy without pulling the whole lib into scope.

declare module 'react-scrollspy';

// Unity WebGL player globals — set on `window` by the Unity loader scripts and
// by our screens (see src/screens/WEBGL*.tsx). Untyped on purpose; the Unity
// bridge payloads aren't modelled.
interface Window {
  createUnityInstance?: (
    canvas: HTMLElement | null,
    config: Record<string, unknown>,
    onProgress?: (progress: number) => void
  ) => Promise<any>;
  gameInstance?: any;
  unityInitialized?: boolean;
  ReactUnityBridge?: (type: any, payload: any) => void;
}
