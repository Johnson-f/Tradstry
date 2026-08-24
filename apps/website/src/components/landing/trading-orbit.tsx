"use client";

import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getOrbitMode, type OrbitMode } from "./content";
import { EASE_OUT, getEntranceDelays } from "./motion";

const OrbitalSphereBackground = dynamic(
  () =>
    import("@designcodeio/threeui/components/OrbitalSphereBackground").then(
      (module) => module.OrbitalSphereBackground,
    ),
  { ssr: false },
);

const SIGNALS = [
  {
    label: "BROKER FILL",
    value: "NVDA · +1.4R",
    position: "left-[2%] top-[22%]",
    offset: { x: -14, y: -8 },
  },
  {
    label: "RULE CHECK",
    value: "Followed plan",
    position: "right-[2%] top-[16%]",
    offset: { x: 14, y: -8 },
  },
  {
    label: "JOURNAL",
    value: "Chart attached",
    position: "left-[7%] bottom-[18%]",
    offset: { x: -12, y: 10 },
  },
  {
    label: "MCP",
    value: "Context ready",
    position: "right-[4%] bottom-[23%]",
    offset: { x: 14, y: 10 },
  },
] as const;

export function TradingOrbit() {
  const [mode, setMode] = useState<OrbitMode>("static");
  const reducedMotion = useReducedMotion() === true;
  const signalDelays = getEntranceDelays(SIGNALS.length, 0.08, reducedMotion);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    const update = () =>
      setMode(
        getOrbitMode({
          reducedMotion: media.matches,
          saveData: connection.connection?.saveData === true,
          viewportWidth: window.innerWidth,
        }),
      );

    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      className="relative aspect-square w-full max-w-[44rem]"
      role="img"
      aria-label="One connected Tradstry trading record"
    >
      <div className="absolute inset-[9%] rounded-full border border-[#ff8b3d]/15 shadow-[0_0_120px_rgba(255,139,61,0.09)]" />
      <div className="absolute inset-[20%] rounded-full border border-white/[0.06]" />
      {mode !== "static" ? (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reducedMotion ? 0.15 : 0.7, ease: EASE_OUT }}
        >
          <OrbitalSphereBackground
            className="absolute inset-0 !bg-transparent"
            speed={mode === "light" ? 0.35 : 0.7}
            particleOpacity={mode === "light" ? 0.35 : 0.58}
            orbitOpacity={0.2}
            haloOpacity={0.18}
            scale={mode === "light" ? 0.82 : 1}
            hue={312}
          />
        </motion.div>
      ) : (
        <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_38%_34%,rgba(255,139,61,0.24),rgba(53,212,154,0.08)_34%,rgba(10,11,13,0.08)_67%)] ring-1 ring-white/10" />
      )}

      <div className="pointer-events-none absolute inset-[27%] grid place-items-center rounded-full border border-white/10 bg-[#090a0c]/35 shadow-[inset_0_0_50px_rgba(255,255,255,0.03)] backdrop-blur-[2px]">
        <div className="text-center">
          <p className="font-mono text-[9px] tracking-[0.25em] text-zinc-500">
            ACCOUNT RECORD
          </p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">
            One source of truth
          </p>
        </div>
      </div>

      {SIGNALS.map((signal, index) => (
        <motion.div
          key={signal.label}
          initial={
            reducedMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  scale: 0.96,
                  x: signal.offset.x,
                  y: signal.offset.y,
                }
          }
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          transition={{
            duration: reducedMotion ? 0.15 : 0.5,
            delay: signalDelays[index],
            ease: EASE_OUT,
          }}
          className={`absolute ${signal.position} hidden min-w-32 rounded-xl border border-white/10 bg-[#0b0c0e]/72 px-3 py-2.5 shadow-xl backdrop-blur-md sm:block`}
        >
          <p className="font-mono text-[8px] tracking-[0.2em] text-zinc-600">
            {signal.label}
          </p>
          <p className="mt-1 text-[11px] font-medium text-zinc-200">
            {signal.value}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
