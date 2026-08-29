"use client";

import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { EASE_OUT } from "./motion";

const PredictiveArcCanvas = dynamic(
  () =>
    import("@designcodeio/threeui/components/PredictiveArcCanvas").then(
      (module) => module.PredictiveArcCanvas,
    ),
  { ssr: false },
);
const StructureFlowCollection = dynamic(
  () =>
    import("@designcodeio/threeui/components/StructureFlowCollection").then(
      (module) => module.StructureFlowCollection,
    ),
  { ssr: false },
);
const DotMatrixBackground = dynamic(
  () =>
    import("@designcodeio/threeui/components/DotMatrixBackground").then(
      (module) => module.DotMatrixBackground,
    ),
  { ssr: false },
);
const ParticleNetwork = dynamic(
  () =>
    import("@designcodeio/threeui/components/ParticleNetwork").then(
      (module) => module.ParticleNetwork,
    ),
  { ssr: false },
);
const ConnectivityGraph = dynamic(
  () =>
    import("@designcodeio/threeui/components/ConnectivityGraph").then(
      (module) => module.ConnectivityGraph,
    ),
  { ssr: false },
);

export type ThreeUiSceneName =
  | "journal"
  | "analytics"
  | "playbooks"
  | "notebook"
  | "ai"
  | "mcp";

const SCENE_STYLE: Record<
  ThreeUiSceneName,
  {
    opacity: number;
    blendMode: "multiply" | "screen";
    maskImage: string;
    filter?: string;
  }
> = {
  journal: {
    opacity: 0.42,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 74% 44%, black, transparent 68%)",
  },
  analytics: {
    opacity: 0.2,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 72% 54%, black, transparent 64%)",
  },
  playbooks: {
    opacity: 0.4,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 68% 52%, black, transparent 66%)",
    filter: "invert(1) sepia(1) saturate(2) hue-rotate(330deg)",
  },
  notebook: {
    opacity: 0.4,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 72% 46%, black, transparent 64%)",
  },
  ai: {
    opacity: 0.45,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 68% 50%, black, transparent 66%)",
  },
  mcp: {
    opacity: 0.48,
    blendMode: "multiply",
    maskImage: "radial-gradient(ellipse at 64% 48%, black, transparent 68%)",
  },
};

export function InteractiveSceneFrame({
  scene,
  children,
}: {
  scene: ThreeUiSceneName;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion() === true;

  return (
    <motion.div
      className="relative isolate"
      initial={
        reducedMotion
          ? { opacity: 0 }
          : { opacity: 0, clipPath: "inset(0 0 10% 0)" }
      }
      whileInView={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{
        duration: reducedMotion ? 0.12 : 0.7,
        ease: EASE_OUT,
      }}
    >
      {children}
      <ThreeUiScene scene={scene} />
    </motion.div>
  );
}

export function ThreeUiScene({ scene }: { scene: ThreeUiSceneName }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [energy, setEnergy] = useState(1);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    const update = () =>
      setSupported(
        !reducedMotion.matches &&
          finePointer.matches &&
          window.innerWidth >= 900 &&
          connection.connection?.saveData !== true,
      );

    update();
    reducedMotion.addEventListener("change", update);
    finePointer.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      reducedMotion.removeEventListener("change", update);
      finePointer.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !supported) {
      setNearViewport(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry?.isIntersecting === true),
      { rootMargin: "260px 0px", threshold: 0 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [supported]);

  useEffect(() => {
    if (!nearViewport) return;
    let lastY = window.scrollY;
    let frame = 0;
    let settleTimer = 0;
    const update = () => {
      frame = 0;
      const delta = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      setEnergy(1 + Math.min(delta / 90, 1) * 1.6);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setEnergy(1), 180);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [nearViewport]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 14;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 10;
    field.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`;
  };

  const onPointerLeave = () => {
    if (fieldRef.current) {
      fieldRef.current.style.transform = "translate3d(0, 0, 0) scale(1.04)";
    }
  };

  const style = SCENE_STYLE[scene];

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="absolute inset-0 z-10 overflow-hidden rounded-2xl"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {supported && nearViewport ? (
        <motion.div
          initial={{ opacity: 0, filter: "blur(3px)" }}
          animate={{ opacity: style.opacity, filter: "blur(0px)" }}
          transition={{ duration: 0.42, ease: EASE_OUT }}
          className="absolute inset-[-3%]"
          style={{
            mixBlendMode: style.blendMode,
            WebkitMaskImage: style.maskImage,
            maskImage: style.maskImage,
          }}
        >
          <div
            ref={fieldRef}
            className="size-full transition-transform duration-300 ease-out"
            style={{
              transform: "translate3d(0, 0, 0) scale(1.04)",
              filter: style.filter,
            }}
          >
            <SceneCanvas scene={scene} energy={energy} />
          </div>
        </motion.div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_45%,rgba(255,255,255,0.28))]" />
    </div>
  );
}

function SceneCanvas({
  scene,
  energy,
}: {
  scene: ThreeUiSceneName;
  energy: number;
}) {
  if (scene === "journal") {
    return (
      <DotMatrixBackground
        speed={0.24 * energy}
        gridScale={30}
        mouseAmount={0.16}
        pulseSpeed={0.34}
        radius={0.22}
        opacity={0.65}
        hue={205}
        className="!size-full !bg-transparent"
      />
    );
  }
  if (scene === "analytics") {
    return (
      <PredictiveArcCanvas
        mode="light"
        speed={0.55 * energy}
        spacing={11}
        dotSize={4}
        archHeight={0.72}
        thickness={0.95}
        brightness={1.05}
        hue={-155}
        saturation={0.85}
        className="!size-full"
      />
    );
  }
  if (scene === "playbooks") {
    return (
      <StructureFlowCollection
        variant="structure-flow"
        speed={0.65 * energy}
        pointSize={0.075}
        opacity={0.55}
        maskStart={0.05}
        maskSolid={0.25}
        className="!size-full !bg-transparent"
      />
    );
  }
  if (scene === "notebook") {
    return (
      <DotMatrixBackground
        speed={0.2 * energy}
        gridScale={34}
        mouseAmount={0.14}
        pulseSpeed={0.3}
        radius={0.2}
        opacity={0.5}
        hue={205}
        className="!size-full !bg-transparent"
      />
    );
  }
  if (scene === "ai") {
    return (
      <ParticleNetwork
        mode="light"
        speed={0.65 * energy}
        size={0.9}
        gap={2}
        length={1.25}
        density={1.15}
        strokeWidth={0.8}
        opacity={0.9}
        hue={-155}
        saturation={0.75}
        brightness={1.08}
        className="size-full"
      />
    );
  }
  return (
    <ConnectivityGraph
      mode="light"
      speed={0.7 * energy}
      size={0.85}
      gap={2}
      length={1.2}
      density={0.95}
      strokeWidth={0.75}
      opacity={0.9}
      hue={-155}
      saturation={0.75}
      brightness={1.05}
      className="size-full"
    />
  );
}
