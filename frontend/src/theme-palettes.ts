export const LIGHT_PALETTES = [ "default", "cat-latte", "nord-snow", "solarized-light" ] as const;
export const DARK_PALETTES = [ "default", "cat-mocha", "nord", "dracula", "gruvbox", "tokyo-night", "solarized-dark", "rose-pine" ] as const;

export function normalizePalette(value: string | null, tone: "light" | "dark"): string {
    const available: readonly string[] = tone === "light" ? LIGHT_PALETTES : DARK_PALETTES;
    return value && available.includes(value) ? value : "default";
}
