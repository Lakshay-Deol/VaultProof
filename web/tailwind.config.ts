import type { Config } from "tailwindcss";

/**
 * Flare-inspired token set. Light theme only, one accent, flat surfaces.
 * Every value here is referenced from the design section of web/PROMPT.md;
 * nothing in components should hardcode a hex.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Narrow phones: 375px viewports need one extra breakpoint below `sm`.
      screens: {
        xs: "400px",
      },
      colors: {
        // Dark-only. One accent, near-black ground, no glass.
        ink: {
          DEFAULT: "#F2F2F4",
          muted: "#9C9CA6",
          faint: "#7A7A85",
        },
        surface: {
          DEFAULT: "#0B0B0D",
          alt: "#101013",
          sunk: "#17171B",
          raised: "#111114",
        },
        line: {
          DEFAULT: "#26262C",
          strong: "#37373F",
        },
        flare: {
          DEFAULT: "#E62058",
          // Lifted for text on a dark ground: #E62058 on #0B0B0D is only 3.8:1.
          ink: "#FF6E92",
          soft: "#1C0D14",
          border: "#4A1A2C",
        },
        state: {
          ok: "#31D68F",
          okSoft: "#0A1F17",
          pending: "#E8A33D",
          pendingSoft: "#221A0C",
          fail: "#FF5F5F",
          failSoft: "#240F11",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        hero: ["clamp(2.5rem, 6vw, 4.5rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        display: ["clamp(2rem, 4vw, 3rem)", { lineHeight: "1.08", letterSpacing: "-0.03em" }],
        title: ["clamp(1.5rem, 2.5vw, 2rem)", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        lede: ["clamp(1rem, 1.4vw, 1.125rem)", { lineHeight: "1.6", letterSpacing: "-0.005em" }],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
      },
      boxShadow: {
        hover: "0 1px 2px rgba(0,0,0,0.5), 0 8px 24px -10px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(230,32,88,0.35), 0 8px 40px -12px rgba(230,32,88,0.35)",
        focus: "0 0 0 3px rgba(230,32,88,0.35)",
      },
      maxWidth: {
        prose: "44rem",
        shell: "76rem",
      },
      transitionDuration: {
        DEFAULT: "160ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        "caret": {
          "0%, 45%": { opacity: "1" },
          "50%, 95%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "dissolve": {
          "0%": { opacity: "1", filter: "blur(0px)", transform: "scale(1)" },
          "60%": { opacity: "0.25", filter: "blur(7px)", transform: "scale(0.985)" },
          "100%": { opacity: "0", filter: "blur(14px)", transform: "scale(0.96)" },
        },
        "tier-in": {
          "0%": { opacity: "0", transform: "scale(0.9)", filter: "blur(6px)" },
          "100%": { opacity: "1", transform: "scale(1)", filter: "blur(0px)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(230,32,88,0.45)" },
          "70%": { boxShadow: "0 0 0 8px rgba(230,32,88,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(230,32,88,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 200ms ease-out both",
        sweep: "sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite",
        caret: "caret 1s steps(1) infinite",
        dissolve: "dissolve 1100ms cubic-bezier(0.4,0,0.2,1) forwards",
        "tier-in": "tier-in 520ms cubic-bezier(0.22,1,0.36,1) 700ms both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
