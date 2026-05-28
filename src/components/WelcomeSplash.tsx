"use client";

import { useEffect, useState } from "react";
import { LOGO_SRC } from "@/lib/branding";

const PHASE_1_MS = 2000;
const TOTAL_MS = 3000;

let startedAt: number | null = null;

function computeProgress(): number {
  if (startedAt === null) return 0;
  const elapsed = Date.now() - startedAt;
  if (elapsed < PHASE_1_MS) return 1 + (98 * elapsed) / PHASE_1_MS;
  if (elapsed < TOTAL_MS) return 99 + (elapsed - PHASE_1_MS) / 1000;
  return 100;
}

export default function WelcomeSplash() {
  // Initial render: SIEMPRE 0 en SSR y en la primera hidratación del client,
  // para evitar React error #418 (text/style mismatch entre SSR y client).
  // La animación arranca en useEffect (solo se ejecuta en client).
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (startedAt === null) startedAt = Date.now();
    let raf: number | undefined;
    const tick = () => {
      const p = computeProgress();
      setProgress(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(135deg,#0C1318 0%,#1A2634 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "prdiseSplashFadeIn .3s ease",
      }}
    >
      <style>{`
        @keyframes prdiseSplashFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes prdiseSplashLogoIn { from { opacity: 0; transform: translateY(20px) scale(.95) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          padding: 40,
          maxWidth: "90vw",
        }}
      >
        <img
          src={LOGO_SRC}
          alt="Living in PRDISE"
          style={{
            width: "auto",
            height: 80,
            maxWidth: 320,
            animation: "prdiseSplashLogoIn .8s ease",
          }}
        />
        <div
          style={{
            width: 280,
            maxWidth: "80vw",
            height: 4,
            background: "rgba(255,255,255,.08)",
            borderRadius: 99,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background:
                "linear-gradient(90deg,#F5A623,#EF6C2B,#8DC63F,#29ABE2)",
              borderRadius: 99,
              transition: "width .15s ease",
              boxShadow: "0 0 12px rgba(245,166,35,.6)",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: 14,
            letterSpacing: ".2em",
            color: "#F5A623",
            fontWeight: 400,
          }}
        >
          {Math.round(progress)}%
        </div>
        <p
          style={{
            fontFamily: "'Dancing Script',cursive",
            fontSize: 18,
            color: "rgba(255,255,255,.5)",
            marginTop: -8,
          }}
        >
          Welcome to paradise
        </p>
      </div>
    </div>
  );
}
