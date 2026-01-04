import { masterRequest } from "frame-master/server/request";
import { createContext, useContext } from "react";

export const RequestContext = createContext<masterRequest | null>(null);

export function useRequest() {
  const req = useContext(RequestContext);
  if (!req) {
    throw new Error(
      "useRequest must be used within a RequestProvider and server-side only."
    );
  }
  return req;
}
