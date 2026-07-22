"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/**
 * localStorage key the pre-paint script in the root layout reads/writes. Both
 * must agree on this name or the provider and the flash-guard diverge.
 */
export const THEME_STORAGE_KEY = "shayfinance-theme";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function stamp(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private-mode / disabled storage: theme still applies for the session.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Reconcile with the value the pre-paint script already stamped on <html>.
  // The DOM is the source of truth on mount — never recompute here (that would
  // re-flash and risk a hydration mismatch); just read what is already painted.
  useEffect(() => {
    const painted = document.documentElement.getAttribute("data-theme");
    setThemeState(painted === "dark" ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    stamp(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      stamp(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
