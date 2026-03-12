"use client";

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState, useMemo } from 'react';
import { Float, Environment, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';

function RotatingShape(props: any) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [hovered, setHover] = useState(false);

    useFrame((_, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.5;
            meshRef.current.rotation.y += delta * 0.7;

            if (hovered) {
                meshRef.current.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
            } else {
                meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
            }
        }
    });

    const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#7aa2f7',
        roughness: 0.1,
        metalness: 0.8,
        emissive: '#24283b',
        emissiveIntensity: 0.5
    }), []);

    return (
        <Float floatIntensity={2} rotationIntensity={1.5} speed={2}>
            <mesh
                {...props}
                ref={meshRef}
                geometry={geometry}
                material={material}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                {/* Wireframe overlay for "tech" look */}
                <lineSegments>
                    <wireframeGeometry args={[geometry]} />
                    <lineBasicMaterial color="#c0caf5" linewidth={1} transparent opacity={0.3} />
                </lineSegments>
            </mesh>
        </Float>
    );
}

export function Logo3D({ className }: { className?: string }) {
    return (
        <div className={className}>
            <Canvas gl={{ alpha: true }} dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[0, 0, 4]} />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={1} color="#bb9af7" />

                <RotatingShape />

                <Stars radius={100} depth={50} count={200} factor={4} saturation={0} fade speed={1} />
                <Environment preset="city" />
            </Canvas>
        </div>
    );
}
