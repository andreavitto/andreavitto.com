"use client";

/* eslint-disable react/no-unknown-property */
import * as THREE from "three";
import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, MeshTransmissionMaterial } from "@react-three/drei";
import { easing } from "maath";

type LensMeshProps = {
  scale: number;
  ior: number;
  thickness: number;
  chromaticAberration: number;
  anisotropy: number;
};

function LensMesh({ scale, ior, thickness, chromaticAberration, anisotropy }: LensMeshProps) {
  const ref = useRef<THREE.Mesh>(null);
  const { nodes } = useGLTF("/assets/3d/lens.glb") as unknown as {
    nodes: Record<string, THREE.Mesh>;
  };
  const geoWidthRef = useRef(1);

  useEffect(() => {
    const geo = nodes.Cylinder?.geometry;
    if (!geo) return;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geoWidthRef.current = bb ? bb.max.x - bb.min.x || 1 : 1;
  }, [nodes]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const { viewport, pointer, camera } = state;
    const v = viewport.getCurrentViewport(camera, [0, 0, 15]);
    const destX = (pointer.x * v.width) / 2;
    const destY = (pointer.y * v.height) / 2;
    easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);
  });

  return (
    <mesh
      ref={ref}
      scale={scale}
      rotation-x={Math.PI / 2}
      geometry={nodes.Cylinder?.geometry}
    >
      <MeshTransmissionMaterial
        ior={ior}
        thickness={thickness}
        anisotropy={anisotropy}
        chromaticAberration={chromaticAberration}
        transmission={1}
        roughness={0}
        backside
      />
    </mesh>
  );
}

export type GlassLensCanvasProps = {
  scale?: number;
  ior?: number;
  thickness?: number;
  chromaticAberration?: number;
  anisotropy?: number;
};

export default function GlassLensCanvas({
  scale = 0.25,
  ior = 1.15,
  thickness = 5,
  chromaticAberration = 0.1,
  anisotropy = 0.01,
}: GlassLensCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 20], fov: 15 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <LensMesh
        scale={scale}
        ior={ior}
        thickness={thickness}
        chromaticAberration={chromaticAberration}
        anisotropy={anisotropy}
      />
    </Canvas>
  );
}

useGLTF.preload("/assets/3d/lens.glb");
