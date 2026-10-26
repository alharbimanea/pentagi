"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ labels }: { labels: { label: string; light: string; dark: string; system: string } }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // storage can be blocked; the system preference still applies
    }
  }, []);

  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
      aria-label={`${labels.label}: ${labels[theme]}`}
      title={`${labels.label}: ${labels[theme]}`}
      onClick={() => {
        const value = next[theme];
        setTheme(value);
        try {
          if (value === "system") localStorage.removeItem("theme");
          else localStorage.setItem("theme", value);
        } catch {}
        apply(value);
      }}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

export const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
