import type { RadiantDesktopApi } from "./contracts";

declare global {
  interface Window {
    radiant?: RadiantDesktopApi;
  }
}

export {};
