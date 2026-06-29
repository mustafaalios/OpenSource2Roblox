import type { BridgeApi } from "@shared/contracts";

declare global {
  interface Window {
    source2Roblox: BridgeApi;
  }
}

export {};
