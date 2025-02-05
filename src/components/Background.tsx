import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points } from '@react-three/drei';
import * as THREE from 'three';

function WavePoints() {
  const points = useRef<THREE.Points>(null);
  const numPoints = 1000; // Reduced for better performance
  const positions = new Float32Array(numPoints * 3);
  const colors = new Float32Array(numPoints * 3);
  
  // Generate initial positions in a wave pattern
  for (let i = 0; i < numPoints; i++) {
    const i3 = i * 3;
    const angle = (i / numPoints) * Math.PI * 2;
    const radius = 5 + Math.random() * 2;
    
    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = (Math.random() - 0.5) * 4;
    positions[i3 + 2] = Math.sin(angle) * radius;
    
    // Generate colors (purple to pink gradient)
    colors[i3] = 0.486 + Math.random() * 0.1;     // R: ~124/255
    colors[i3 + 1] = 0.227 + Math.random() * 0.1; // G: ~58/255
    colors[i3 + 2] = 0.929 + Math.random() * 0.1; // B: ~237/255
  }

  useFrame((state) => {
    if (!points.current) return;
    
    // Gentle wave animation
    for (let i = 0; i < numPoints * 3; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const angle = Math.atan2(z, x);
      const time = state.clock.elapsedTime * 0.3;
      
      positions[i + 1] = Math.sin(angle * 2 + time) * 0.5;
    }
    
    // Rotate the entire point cloud very slowly
    points.current.rotation.y = state.clock.elapsedTime * 0.05;
    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <Points ref={points}>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
        vertexColors
      />
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={numPoints}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={numPoints}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
    </Points>
  );
}

export function Background() {
  return (
    <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background to-background/80">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        style={{ background: 'transparent' }}
      >
        <WavePoints />
      </Canvas>
    </div>
  );
}
