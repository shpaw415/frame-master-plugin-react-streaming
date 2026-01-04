import { masterRequest } from "frame-master/server/request";
import { createContext, useContext } from "react";

export const RequestContext = createContext<masterRequest | null>(null);

/**
 * Hook to access the current masterRequest in React components.
 *
 * - masterRequest is available only during server-side rendering.
 * - null is returned if used outside of a request context. (client-side or outside SSR)
 * @returns masterRequest | null
 */
export function useRequest() {
  const req = useContext(RequestContext);
  return req;
}
