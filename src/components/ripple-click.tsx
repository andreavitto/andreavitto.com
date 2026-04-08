"use client";

import { useEffect, useRef, useCallback } from "react";
import * as PIXI from "pixi.js";

interface RippleClickProps {
  children: React.ReactNode;
  className?: string;
  href?: string;
  rippleStrength?: number;
  rippleDuration?: number;
}

function createRippleTexture(): PIXI.Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const numRings = 8;
  const wf = (Math.PI * 2 * numRings) / maxR;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const len = dist || 1;
      const nx = dx / len;
      const ny = dy / len;
      const wave = Math.sin(dist * wf);
      const edge = Math.max(0, 1 - dist / maxR);
      const center = Math.min(1, dist / (maxR * 0.1));
      const intensity = wave * edge * center;
      const idx = (y * size + x) * 4;
      data[idx] = 128 + nx * intensity * 127;
      data[idx + 1] = 128 + ny * intensity * 127;
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return PIXI.Texture.from(canvas);
}

// Shared texture across all instances
let sharedRippleTex: PIXI.Texture | null = null;
function getRippleTexture() {
  if (!sharedRippleTex) sharedRippleTex = createRippleTexture();
  return sharedRippleTex;
}

export function RippleClick({
  children,
  className = "",
  href,
  rippleStrength = 18,
  rippleDuration = 1200,
}: RippleClickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const isAnimatingRef = useRef(false);

  const spawnRipple = useCallback(
    async (clickX: number, clickY: number) => {
      const container = containerRef.current;
      if (!container || isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      const cw = container.clientWidth;
      const ch = container.clientHeight;

      // Create PixiJS app overlay
      const app = new PIXI.Application();
      await app.init({
        width: cw,
        height: ch,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });

      appRef.current = app;
      app.canvas.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;";
      container.appendChild(app.canvas);

      // Capture the container content as a texture via html2canvas-like approach
      // Instead, we'll use a displacement filter on a transparent overlay
      // that warps the underlying HTML via CSS
      const rippleTex = getRippleTexture();

      // Ripple sprite centered on click position
      const rippleSprite = new PIXI.Sprite(rippleTex);
      rippleSprite.anchor.set(0.5);
      rippleSprite.x = clickX;
      rippleSprite.y = clickY;
      rippleSprite.width = 10;
      rippleSprite.height = 10;
      rippleSprite.alpha = 0;
      app.stage.addChild(rippleSprite);

      const filter = new PIXI.DisplacementFilter({
        sprite: rippleSprite,
        scale: { x: 0, y: 0 },
      });
      app.stage.filters = [filter];

      const startTime = performance.now();

      function animate() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / rippleDuration);

        if (progress >= 1) {
          // Cleanup
          app.destroy(true);
          appRef.current = null;
          isAnimatingRef.current = false;
          return;
        }

        const easeOut = 1 - Math.pow(1 - progress, 3);
        const maxSize = Math.max(cw, ch) * 2.5;
        rippleSprite.width = 10 + (maxSize - 10) * easeOut;
        rippleSprite.height = 10 + (maxSize - 10) * easeOut;

        const fadeIn = Math.min(1, progress * 8);
        const fadeOut = 1 - Math.pow(progress, 2);
        rippleSprite.alpha = fadeIn * fadeOut * 0.6;

        const str =
          rippleStrength *
          Math.sin(progress * Math.PI) *
          (1 - progress * 0.5);
        filter.scale.x = str;
        filter.scale.y = str;

        requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
    },
    [rippleStrength, rippleDuration]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      spawnRipple(x, y);

      // Navigate after a short delay for the effect to be visible
      if (href) {
        e.preventDefault();
        setTimeout(() => {
          window.location.href = href;
        }, 300);
      }
    },
    [href, spawnRipple]
  );

  useEffect(() => {
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      {children}
    </div>
  );
}
