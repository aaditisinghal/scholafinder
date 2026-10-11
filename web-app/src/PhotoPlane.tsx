import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { RepeatWrapping, type Mesh, type Texture } from "three";
import type { MotionValue } from "framer-motion";

/** Mimics CSS object-fit: cover — crops the texture instead of stretching it to the plane. */
function fitCover(texture: Texture, planeAspect: number) {
  const img = texture.image as { width: number; height: number };
  if (!img?.width || !img?.height) return;
  const imageAspect = img.width / img.height;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  if (imageAspect > planeAspect) {
    texture.repeat.set(planeAspect / imageAspect, 1);
    texture.offset.set((1 - planeAspect / imageAspect) / 2, 0);
  } else {
    texture.repeat.set(1, imageAspect / planeAspect);
    texture.offset.set(0, (1 - imageAspect / planeAspect) / 2);
  }
}

function Plane({ url, dragX }: { url: string; dragX: MotionValue<number> }) {
  const texture = useTexture(url);
  const meshRef = useRef<Mesh>(null);
  const { viewport } = useThree();

  useEffect(() => {
    fitCover(texture, viewport.width / viewport.height);
  }, [texture, viewport.width, viewport.height]);

  useFrame(() => {
    if (!meshRef.current) return;
    const target = Math.max(-0.45, Math.min(0.45, dragX.get() / 280));
    meshRef.current.rotation.y += (target - meshRef.current.rotation.y) * 0.15;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function PhotoPlane({ url, dragX }: { url: string; dragX: MotionValue<number> }) {
  return (
    <Canvas dpr={Math.min(window.devicePixelRatio, 2)} gl={{ antialias: true, alpha: true }} style={{ width: "100%", height: "100%" }}>
      <Plane url={url} dragX={dragX} />
    </Canvas>
  );
}
