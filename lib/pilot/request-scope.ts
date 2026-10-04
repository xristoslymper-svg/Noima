import { AsyncLocalStorage } from 'node:async_hooks';
export const pilotScope = new AsyncLocalStorage<{token:string;workspace:string}>();
export function pilotAuthorization():Record<string,string> {
  const scope = pilotScope.getStore();
  return scope ? { Authorization: `Bearer ${scope.token}` } : {};
}
