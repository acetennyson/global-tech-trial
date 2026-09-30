import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
}

// Holds the current request ID so the logger can read it anywhere.
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
