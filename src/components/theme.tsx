"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * localStorage key the pre-paint script in the root layout reads/writes. Both
 * must agree on this name or the toggle and the flash-guard diverge.
 */
export const THEME_STORAGE_KEY = "shayfinance-theme";

/**
 * `<html data-theme>` is the single source of truth: the pre-paint inline
 * script stamps it before hydration, so reading the attribute here — rather
 * than recomputing from storage in a mount effect — keeps the toggle in sync
 * with the painted theme without a flash or a setState-in-effect. Reads go
 * through useSyncExternalStore so the server snapshot pins hydration to light
 * and React reconciles to the real attribute after mount (no cascading render).
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private-mode / disabled storage: theme still applies for the session.
  }
  listeners.forEach((notify) => notify());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);
  const toggleTheme = useCallback(
    () => applyTheme(getSnapshot() === "dark" ? "light" : "dark"),
    [],
  );

  return { theme, setTheme, toggleTheme };
}
