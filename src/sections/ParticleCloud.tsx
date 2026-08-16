import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

const themes = [
  { bg: '#050505', particle: 0x222222, line: 0x00ffff },
  { bg: '#0a0505', particle: 0x331111, line: 0xff3333 },
  { bg: '#050a05', particle: 0x113311, line: 0x33ff33 },
  { bg: '#050510', particle: 0x111133, line: 0x3333ff },
  { bg: '#0a0a05', particle: 0x333311, line: 0xffff33 },
  { bg: '#0a050a', particle: 0x331133, line: 0xff33ff },
  { bg: '#050a0a', particle: 0x113333, line: 0x33ffff },
  { bg: '#0f0f0f', particle: 0x222222, line: 0xffffff },
  { bg: '#0a0805', particle: 0x332211, line: 0xff8833 },
  { bg: '#050508', particle: 0x221133, line: 0xaa66ff },
];

const ParticleCloud = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const currentColorsRef = useRef({
    bg: new THREE.Color(themes[0].bg),
    particle: new THREE.Color(themes[0].particle),
    line: new THREE.Color(themes[0].line),
  });
  const activeModeRef = useRef(0);
  const mouseXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);
  const timeRef = useRef(0);

  const applyColorMode = useCallback((modeIndex: number) => {
    if (modeIndex === activeModeRef.current) return;
    activeModeRef.current = modeIndex;
    const mode = themes[modeIndex];
    const duration = 4;
    const ease = 'power2.inOut';
    const currentColors = currentColorsRef.current;

    gsap.to(currentColors.bg, {
      r: new THREE.Color(mode.bg).r,
      g: new THREE.Color(mode.bg).g,
      b: new THREE.Color(mode.bg).b,
      duration,
      ease,
      onUpdate: () => {
        document.body.style.background = `#${currentColors.bg.getHexString()}`;
      },
    });

    gsap.to(currentColors.particle, {
      r: new THREE.Color(mode.particle).r,
      g: new THREE.Color(mode.particle).g,
      b: new THREE.Color(mode.particle).b,
      duration,
      ease,
      onUpdate: () => {
        if (materialRef.current) {
          materialRef.current.color.copy(currentColors.particle);
        }
      },
    });

    gsap.to(currentColors.line, {
      r: new THREE.Color(mode.line).r,
      g: new THREE.Color(mode.line).g,
      b: new THREE.Color(mode.line).b,
      duration,
      ease,
      onUpdate: () => {
        if (lineMaterialRef.current) {
          lineMaterialRef.current.color.copy(currentColors.line);
          const brightness = currentColors.line.getHex() / 0xffffff;
          lineMaterialRef.current.opacity = 0.15 + (1 - brightness) * 0.3;
          if (materialRef.current) {
            materialRef.current.emissive.copy(currentColors.line).multiplyScalar(0.2);
          }
        }
      },
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instanceCount = 1200;
    const maxConnections = 2000;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 50;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Instanced Mesh
    const geometry = new THREE.TetrahedronGeometry(0.3, 0);
    const material = new THREE.MeshStandardMaterial({
      color: themes[0].particle,
      roughness: 0.4,
      metalness: 0.1,
    });
    materialRef.current = material;
    const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
    scene.add(mesh);

    // Particle data
    const positions: THREE.Vector3[] = [];
    const velocities: number[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < instanceCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / instanceCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 15 + Math.random() * 10;
      positions.push(
        new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        )
      );
      velocities.push((Math.random() - 0.5) * 0.02);
    }

    // Proximity Lines
    const lineGeometry = new THREE.BufferGeometry();
    const positionsLine = new Float32Array(maxConnections * 2 * 3);
    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positionsLine, 3)
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: themes[0].line,
      transparent: true,
      opacity: 0.25,
    });
    lineMaterialRef.current = lineMaterial;
    const lineMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineMesh);

    // Mouse events
    const onMouseDown = () => {
      isDraggingRef.current = true;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        mouseXRef.current += e.movementX * 2;
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Touch events
    const onTouchStart = (e: TouchEvent) => {
      isDraggingRef.current = true;
      const touch = e.touches[0];
      (mouseXRef as any)._lastTouchX = touch.clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        const touch = e.touches[0];
        const dx = touch.clientX - ((mouseXRef as any)._lastTouchX || touch.clientX);
        mouseXRef.current += dx * 2;
        (mouseXRef as any)._lastTouchX = touch.clientX;
      }
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    // Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Expose applyColorMode to window for button access
    (window as any).__applyColorMode = applyColorMode;

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.01;
      const time = timeRef.current;

      let lineIndex = 0;

      for (let i = 0; i < instanceCount; i++) {
        // Orbit
        const cos_v = Math.cos(velocities[i]);
        const sin_v = Math.sin(velocities[i]);
        const x = positions[i].x;
        const z = positions[i].z;
        positions[i].x = x * cos_v - z * sin_v;
        positions[i].z = x * sin_v + z * cos_v;

        // Noise displacement
        positions[i].x += Math.sin(time * 0.5 + positions[i].y * 0.1) * 0.05;
        positions[i].y += Math.cos(time * 0.3 + positions[i].x * 0.1) * 0.05;
        positions[i].z += Math.sin(time * 0.4 + positions[i].z * 0.1) * 0.05;

        // Update instance matrix
        dummy.position.copy(positions[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Proximity check (only check a subset for performance)
        if (i % 3 === 0) {
          for (let j = i + 1; j < instanceCount && j < i + 30; j++) {
            if (lineIndex >= maxConnections) break;
            const dist = positions[i].distanceTo(positions[j]);
            if (dist < 8) {
              const idx = lineIndex * 6;
              positionsLine[idx] = positions[i].x;
              positionsLine[idx + 1] = positions[i].y;
              positionsLine[idx + 2] = positions[i].z;
              positionsLine[idx + 3] = positions[j].x;
              positionsLine[idx + 4] = positions[j].y;
              positionsLine[idx + 5] = positions[j].z;
              lineIndex++;
            }
          }
        }
      }

      mesh.instanceMatrix.needsUpdate = true;
      lineMesh.geometry.setDrawRange(0, lineIndex * 2);
      lineMesh.geometry.attributes.position.needsUpdate = true;

      // Camera orbit
      camera.position.x = Math.sin(mouseXRef.current * 0.001) * 50;
      camera.position.z = Math.cos(mouseXRef.current * 0.001) * 50;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
      delete (window as any).__applyColorMode;
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [applyColorMode]);

  return (
    <div
      ref={containerRef}
      id="canvas-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  );
};

export default ParticleCloud;
