"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DotMatrixBackground = dynamic(
  () =>
    import("@designcodeio/threeui/components/DotMatrixBackground").then(
      (module) => module.DotMatrixBackground,
    ),
  { ssr: false },
);

export function HeroSignalField() {
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    const update = () =>
      setInteractive(
        !reducedMotion.matches &&
          finePointer.matches &&
          window.innerWidth >= 768 &&
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

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(24,24,27,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(24,24,27,0.035)_1px,transparent_1px)] bg-[size:24px_24px]" />
      {interactive ? (
        <DotMatrixBackground
          className="!absolute !inset-0 !bg-transparent mix-blend-multiply [mask-image:radial-gradient(ellipse_at_68%_48%,black,transparent_76%)]"
          speed={0.24}
          gridScale={28}
          mouseAmount={0.16}
          pulseSpeed={0.36}
          radius={0.28}
          opacity={0.48}
          hue={205}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_58%,white_94%)]" />
    </div>
  );
}
