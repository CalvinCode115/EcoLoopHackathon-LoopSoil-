"use client";

import { useLayoutEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth-provider";

export type ThemePreference = "LIGHT" | "DARK";

/**
 * The manager light/dark switch. The choice is saved on the account (User.theme, via
 * PATCH /auth/me/theme), so it survives log-out and follows the manager to any device.
 *
 * While a manager page is mounted this puts data-theme="light" | "dark" on <html>, which
 * switches the colour tokens in globals.css. Leaving the manager area (log out, or a
 * taker/public page) removes it, so nothing outside /manager is ever themed.
 */
export function useManagerTheme(): {
  theme: ThemePreference;
  setTheme(next: ThemePreference): void;
} {
  const { user, refreshUser } = useAuth();
  // The switch answers instantly; the save happens in the background.
  const [chosen, setChosen] = useState<ThemePreference | null>(null);
  const theme = chosen ?? user?.theme ?? "LIGHT";

  // Layout effect: applied before the first paint, so there's no flash of the other mode.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === "DARK" ? "dark" : "light";
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  function setTheme(next: ThemePreference) {
    const previous = theme;
    setChosen(next);
    api
      .patch("/auth/me/theme", { theme: next })
      .then(refreshUser)
      .catch(() => setChosen(previous)); // not saved — don't pretend it was
  }

  return { theme, setTheme };
}
