/**
 * Converts a HEX color string to a Shadcn-compatible HSL string (e.g., "204 100% 40%").
 */
function hexToHsl(hex: string): string {
    // Remove hash if present
    hex = hex.replace(/^#/, '');

    // Parse r, g, b
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return hex; // Not a valid hex, return as is (could be already HSL or generic)
    }

    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Convert to degrees and percentages
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    return `${h} ${s}% ${l}%`;
}

/**
 * Applies a theme object dynamically by injecting CSS variables into the document root.
 */
export function applyTheme(themeObj: Record<string, string>) {
    if (typeof document === 'undefined') return;
    
    for (const [key, value] of Object.entries(themeObj)) {
        // Assume anything starting with # is a hex color that needs conversion for Shadcn
        const finalValue = value.startsWith('#') ? hexToHsl(value) : value;
        document.documentElement.style.setProperty(`--${key}`, finalValue);
    }
}

/**
 * Saves a theme object to localStorage and immediately applies it.
 */
export function saveTheme(themeObj: Record<string, string>) {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem('myfinsheet:theme', JSON.stringify(themeObj));
    applyTheme(themeObj);
}

/**
 * Loads the active theme from localStorage and applies it on app startup.
 */
export function initTheme() {
    if (typeof window === 'undefined') return;
    
    const stored = localStorage.getItem('myfinsheet:theme');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            applyTheme(parsed);
        } catch (e) {
            console.error("Failed to parse stored theme", e);
        }
    }
}
