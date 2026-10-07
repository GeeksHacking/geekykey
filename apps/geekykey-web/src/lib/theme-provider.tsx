import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  readStoredPreference,
  readSystemTheme,
  subscribeToSystemTheme,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [system, setSystem] = useState<ResolvedTheme>(readSystemTheme);

  useEffect(() => subscribeToSystemTheme(() => setSystem(readSystemTheme())), []);

  const resolved = preference === "system" ? system : preference;

  // index.html already toggles the class before first paint, so this keeps the two in step
  // rather than being what makes the theme work.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or storage disabled: the choice just does not persist.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
