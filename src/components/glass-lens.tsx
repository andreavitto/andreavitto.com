"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, ReactNode } from "react";
import type { GlassLensCanvasProps } from "./glass-lens-canvas";

const GlassLensCanvas = dynamic(() => import("./glass-lens-canvas"), {
  ssr: false,
});

type GlassLensProps = GlassLensCanvasProps & {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Where the canvas overlay sits. 'cover' fills the parent; 'fixed' covers the viewport. */
  layout?: "cover" | "fixed";
  /** Opacity of the canvas overlay (the lens always stays fully visible). */
  overlayOpacity?: number;
};

export function GlassLens({
  children,
  className,
  style,
  layout = "cover",
  overlayOpacity = 1,
  ...lensProps
}: GlassLensProps) {
  const overlayStyle: CSSProperties =
    layout === "fixed"
      ? { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 5, opacity: overlayOpacity }
      : { position: "absolute", inset: 0, pointerEvents: "none", opacity: overlayOpacity };

  return (
    <div
      className={className}
      style={{ position: layout === "cover" ? "relative" : undefined, ...style }}
    >
      {children}
      <div style={overlayStyle} aria-hidden="true">
        <GlassLensCanvas {...lensProps} />
      </div>
    </div>
  );
}
