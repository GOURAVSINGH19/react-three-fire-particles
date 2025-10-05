import * as THREE from 'three';

import { Environment, Stats, useTexture } from '@react-three/drei';
import {
  Canvas,
  RootState,
  ShaderMaterialProps,
  useFrame,
  useThree
} from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { MapControls } from './MapControls';

const vertexShader = `
  uniform float pointMultiplier;

  attribute float size;
  attribute float angle;
  attribute vec4 colour;

  varying vec4 vColour;
  varying vec2 vAngle;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size * pointMultiplier / gl_Position.w;

    vAngle = vec2(cos(angle), sin(angle));
    vColour = colour;
  }
`;

const fragmentShader = `
  uniform sampler2D diffuseTexture;

  varying vec4 vColour;
  varying vec2 vAngle;

  void main() {
    vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
    gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
  }
`;

class LinearSpline {
  points = [];
  lerp;

  constructor(lerp) {
    this.lerp = lerp;
  }

  addPoint(t, d) {
    this.points.push([t, d]);
  }

  get(t) {
    let p1 = 0;

    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i][0] >= t) {
        break;
      }
      p1 = i;
    }

    const p2 = Math.min(this.points.length - 1, p1 + 1);

    if (p1 === p2) {
      return this.points[p1][1];
    }

    return this.lerp(
      (t - this.points[p1][0]) / (this.points[p2][0] - this.points[p1][0]),
      this.points[p1][1],
      this.points[p2][1]
    );
  }
}

const vec3 = new THREE.Vector3();

const createParticles = (count = 20) => {
  const arr = [];

  for (let i = 0; i < count; i++) {
    const life = (Math.random() * 0.75 + 0.25) * 10.0;
    // Particle definition object
    arr.push({
      position: vec3
        .clone()
        .set(
          (Math.random() * 2 - 1) * 1,
          (Math.random() * 2 - 1) * 1,
          (Math.random() * 2 - 1) * 1
        ),
      size: (Math.random() * 0.5 + 0.5) * 4.0,
      currentSize: 1,
      color: new THREE.Color(Math.random(), Math.random(), Math.random()),
      alpha: 1,
      life,
      maxLife: life,
      rotation: Math.random() * 2 * Math.PI,
      velocity: new THREE.Vector3(0, -15, 0)
    });
  }

  return arr;
};

const Fire = () => {
  const points = useRef<THREE.Points>();
  const texture = useTexture('/assets/images/fire.png');

  const shaderProps = useMemo<ShaderMaterialProps>(
    () => ({
      uniforms: {
        diffuseTexture: {
          value: texture
        },
        pointMultiplier: {
          value:
            window.innerHeight /
            (2.0 * Math.tan((0.5 * 60.0 * Math.PI) / 180.0))
        }
      },
      fragmentShader,
      vertexShader,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      vertexColors: true
    }),
    [texture]
  );

  const alphaSpline = useMemo(() => {
    const spline = new LinearSpline(
      (t: any, a: any, b: any) => a + t * (b - a)
    );

    spline.addPoint(0, 0);
    spline.addPoint(0.1, 1);
    spline.addPoint(0.6, 1);
    spline.addPoint(1, 0);

    return spline;
  }, []);

  const sizeSpline = useMemo(() => {
    const spline = new LinearSpline(
      (t: any, a: any, b: any) => a + t * (b - a)
    );

    spline.addPoint(0, 1);
    spline.addPoint(0.5, 5);
    spline.addPoint(1, 1);

    return spline;
  }, []);

  const colorSpline = useMemo(() => {
    const spline = new LinearSpline((t: any, a: any, b: any) =>
      a.clone().lerp(b, t)
    );

    spline.addPoint(0, new THREE.Color(0xffff80));
    spline.addPoint(1, new THREE.Color(0xff8080));

    return spline;
  }, []);

  const [particles, setParticles] = useState(createParticles());

  useLayoutEffect(() => {
    document.addEventListener(
      'keyup',
      (e: KeyboardEvent) => {
        if (e.keyCode === 32) {
          setParticles(createParticles());
        }
      },
      false
    );
  }, []);

  useFrame(({ camera }, delta) => {
    const filteredParticles = particles
      .filter(({ life }) => life > 0)
      .sort((a, b) => {
        const d1 = camera.position.distanceTo(a.position);
        const d2 = camera.position.distanceTo(b.position);

        if (d1 > d2) {
          return -1;
        }

        if (d1 < d2) {
          return 1;
        }

        return 0;
      });

    const positions = [];
    const sizes = [];
    const colors = [];
    const angles = [];

    for (let particle of filteredParticles) {
      particle.life -= delta;

      const t = 1 - particle.life / particle.maxLife;

      particle.rotation += delta * 0.5;
      particle.position.add(particle.velocity.clone().multiplyScalar(delta));
      particle.alpha = alphaSpline.get(t);
      particle.currentSize = particle.size * sizeSpline.get(t);
      particle.color.copy(colorSpline.get(t));

      const drag = particle.velocity.clone();

      drag.multiplyScalar(delta * 0.1);
      drag.x =
        Math.sign(particle.velocity.x) *
        Math.min(Math.abs(drag.x), Math.abs(particle.velocity.x));
      drag.y =
        Math.sign(particle.velocity.y) *
        Math.min(Math.abs(drag.y), Math.abs(particle.velocity.y));
      drag.z =
        Math.sign(particle.velocity.z) *
        Math.min(Math.abs(drag.z), Math.abs(particle.velocity.z));
      particle.velocity.sub(drag);
    }

    for (const {
      position,
      currentSize,
      color,
      alpha,
      rotation
    } of filteredParticles) {
      positions.push(...position.toArray());
      sizes.push(currentSize);
      colors.push(color.r, color.g, color.b, alpha);
      angles.push(rotation);
    }

    points.current.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    points.current.geometry.setAttribute(
      'size',
      new THREE.Float32BufferAttribute(sizes, 1)
    );
    points.current.geometry.setAttribute(
      'colour',
      new THREE.Float32BufferAttribute(colors, 4)
    );
    points.current.geometry.setAttribute(
      'angle',
      new THREE.Float32BufferAttribute(angles, 1)
    );

    points.current.geometry.attributes.position.needsUpdate = true;
    points.current.geometry.attributes.size.needsUpdate = true;
    points.current.geometry.attributes.colour.needsUpdate = true;
    points.current.geometry.attributes.angle.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          args={[Float32Array.from([]), 3]}
          attachObject={['attributes', 'position']}
        />
        <bufferAttribute
          args={[Float32Array.from([]), 1]}
          attachObject={['attributes', 'size']}
        />
        <bufferAttribute
          args={[Float32Array.from([]), 4]}
          // We have to use 'colour', because 'color' is a reserved name in GLSL.
          attachObject={['attributes', 'colour']}
        />
        <bufferAttribute
          args={[Float32Array.from([]), 1]}
          attachObject={['attributes', 'angle']}
        />
      </bufferGeometry>
      <shaderMaterial attach="material" {...shaderProps} />
    </points>
  );
};

export const App = () => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 12, 6] }}>
        <ambientLight />
        <pointLight position={[150, 150, 150]} intensity={1} />
        <MapControls>
          <Suspense fallback={null}>
            <Environment preset="forest" background />
            <Fire />
          </Suspense>
        </MapControls>
        <gridHelper />
        <Stats />
      </Canvas>
    </div>
  );
};
