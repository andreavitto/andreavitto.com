"use client";

export function AmbientBlobs() {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -1 }}
      aria-hidden="true"
    >
      {/* Violet — top left */}
      <div
        className="absolute animate-[ambient-drift-1_20s_ease-in-out_infinite] rounded-full"
        style={{
          width: "50vmax",
          height: "50vmax",
          background:
            "radial-gradient(circle at 30% 40%, var(--blob-1), transparent 70%)",
          opacity: 0.2,
          filter: "blur(120px)",
          top: "-15%",
          left: "-10%",
        }}
      />
      {/* Cyan — center right */}
      <div
        className="absolute animate-[ambient-drift-2_26s_ease-in-out_infinite] rounded-full"
        style={{
          width: "45vmax",
          height: "45vmax",
          background:
            "radial-gradient(circle at 60% 50%, var(--blob-2), transparent 70%)",
          opacity: 0.15,
          filter: "blur(140px)",
          top: "20%",
          right: "-15%",
        }}
      />
      {/* Pink — bottom center */}
      <div
        className="absolute animate-[ambient-drift-3_23s_ease-in-out_infinite] rounded-full"
        style={{
          width: "40vmax",
          height: "40vmax",
          background:
            "radial-gradient(circle at 50% 60%, var(--blob-3), transparent 70%)",
          opacity: 0.15,
          filter: "blur(150px)",
          bottom: "-20%",
          left: "25%",
        }}
      />
    </div>
  );
}
