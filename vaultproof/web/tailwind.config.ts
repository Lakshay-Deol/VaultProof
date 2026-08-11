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
          // The warm end of Flare's brand ramp. Only ever the far stop of a
          // gradient — never a solid fill, or the page grows a second accent.
          ember: "#FF7A45",
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
      backgroundImage: {
        // Flare's brand ramp, pink through to ember. 200% wide so the
        // `text-shine` keyframe has somewhere to travel.
        "flare-ramp": "linear-gradient(100deg, #F2F2F4 0%, #FF6E92 38%, #FF7A45 55%, #F2F2F4 100%)",
        "flare-edge": "linear-gradient(90deg, transparent, #E62058, #FF7A45, transparent)",
      },
      backgroundSize: {
        shine: "220% 100%",
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
        // Deep lift for the hero terminal and the closing CTA — the only two
        // places a card is allowed to look like it is floating.
        lift: "0 1px 1px rgba(0,0,0,0.6), 0 24px 60px -24px rgba(0,0,0,0.9)",
        "glow-lg": "0 0 0 1px rgba(230,32,88,0.28), 0 24px 90px -30px rgba(230,32,88,0.55)",
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
        /*
         * Slow drift of the hero wash. Large, cheap (transform only), and long
         * enough that it reads as ambient light rather than as an animation.
         */
        aurora: {
          "0%": { transform: "translate3d(-3%, -2%, 0) scale(1.05)" },
          "50%": { transform: "translate3d(4%, 3%, 0) scale(1.12)" },
          "100%": { transform: "translate3d(-2%, 2%, 0) scale(1.06)" },
        },
        /* Light sweeping across a button on hover. */
        sheen: {
          "0%": { transform: "translateX(-130%) skewX(-18deg)" },
          "100%": { transform: "translateX(230%) skewX(-18deg)" },
        },
        /* Accent line that draws itself under a heading. */
        "draw-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        /*
         * Ticker. The track holds the content twice, so travelling exactly
         * -50% lands the copy on the original and the loop is seamless.
         */
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        /* Brand ramp sliding through a headline. Background-position only. */
        "text-shine": {
          from: { backgroundPosition: "180% 50%" },
          to: { backgroundPosition: "-20% 50%" },
        },
        /* Conic highlight rotating around a card's border. */
        beam: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        /* A packet travelling along the landing-page pipeline rail. */
        travel: {
          "0%": { transform: "translateX(-8%)", opacity: "0" },
          "12%, 88%": { opacity: "1" },
          "100%": { transform: "translateX(108%)", opacity: "0" },
        },
        /* Slow vertical scan over the hero visual, like a quote being read. */
        scan: {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(520%)" },
        },
        /* Live-status dot: a ring that expands and fades, once per period. */
        ping: {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "70%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        /* Tier bars drawing themselves out from the left. */
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
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
        aurora: "aurora 24s cubic-bezier(0.45,0,0.55,1) infinite alternate",
        sheen: "sheen 850ms cubic-bezier(0.22,1,0.36,1)",
        "draw-x": "draw-x 700ms cubic-bezier(0.22,1,0.36,1) 220ms both",
        float: "float 7s ease-in-out infinite",
        marquee: "marquee var(--marquee-duration, 42s) linear infinite",
        "text-shine": "text-shine 7s cubic-bezier(0.45,0,0.55,1) infinite",
        beam: "beam 6s linear infinite",
        travel: "travel 3.6s cubic-bezier(0.45,0,0.55,1) infinite",
        scan: "scan 5.5s cubic-bezier(0.45,0,0.55,1) infinite",
        ping: "ping 2.4s cubic-bezier(0,0,0.2,1) infinite",
        "grow-x": "grow-x 900ms cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
