"use client";

import { createContext, useContext } from "react";

/** Shared console-shell state handed down to the route pages. The layout owns
    the values; pages consume them (directly or through their views). */
export interface ConsoleNav {
  /** Reports the live territory selection so the sidebar level tabs stay in
      sync with the governance deck's internal navigation. */
  onNodeNavigate: (nodeId: string) => void;
}

export const ConsoleNavContext = createContext<ConsoleNav>({
  onNodeNavigate: () => {},
});

export const useConsoleNav = () => useContext(ConsoleNavContext);
