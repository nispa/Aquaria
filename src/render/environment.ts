import {
  AdditiveBlending,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShaderMaterial,
  type BufferGeometry,
  type Material,
} from "three";
import type { Rng } from "../core/rng";
import type { Scene } from "../scene/schema";
import type { Prop } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
import { CAUSTICS_GLSL } from "./shaders/caustics";
import { causticsPatch } from "./shaders/causticsPatch";
import { patchMaterial } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";

/** How far the sand, surface and backdrop extend beyond the tank, in tank sizes. */
const EXTENT = 6;
/** Distance of the backdrop behind the back of the tank, m. */
const BACKDROP_DISTANCE = 10;
const LIGHT_SHAFT_COUNT = 7;
/** Sand in front of the glass, m, so the floor never ends inside the view. */
const FLOOR_FRONT_OVERHANG = 2;
/** Gap between the far end of the sand and the backdrop, m (hidden by fog). */
const BACKDROP_GAP = 1;
const ROCK_VARIANTS = 5;
/** Starfish drift: one full turn takes this many seconds. */
const STARFISH_TURN_SECONDS = 1800;

export interface Environment {
  readonly object: Group;
  update(timeSeconds: number): void;
  setLightShaftsVisible(visible: boolean): void;
  dispose(): void;
}

interface Tracker {
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
}

function floor(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const width = scene.tank.width * EXTENT;
  // The sand stops just short of the backdrop: where the two meet, depth-based
  // effects (ambient occlusion) would draw a crease along the horizon.
  const depth = scene.tank.depth + BACKDROP_DISTANCE + FLOOR_FRONT_OVERHANG - BACKDROP_GAP;
  const geometry = new PlaneGeometry(width, depth, 240, 120);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -depth / 2 + FLOOR_FRONT_OVERHANG);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, floorHeight(positions.getX(index), positions.getZ(index)));
  }
  geometry.computeVertexNormals();
  const material = patchMaterial(
    new MeshStandardMaterial({ color: new Color(scene.floor.color), roughness: 0.95 }),
    [
      {
        name: "sand-grain",
        fragmentHead: /* glsl */ `
          float sandHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
        `,
        fragment: [
          [
            "#include <color_fragment>",
            /* glsl */ `
            #include <color_fragment>
            diffuseColor.rgb *= 0.88 + 0.12 * sandHash(floor(vCausticPosition.xz * 180.0));
            `,
          ],
        ],
      },
      causticsPatch(water),
    ],
  );
  tracker.geometries.push(geometry);
  tracker.materials.push(material);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** A lumpy, flattened icosahedron; the seed makes every variant different. */
function rockGeometry(rng: Rng): BufferGeometry {
  const geometry = new IcosahedronGeometry(0.5, 3);
  const [a, b, c] = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const lump =
      1 +
      0.22 * Math.sin(x * 5 + a) * Math.sin(y * 4 + b) * Math.sin(z * 5 + c) +
      0.08 * Math.sin(x * 13 + b + y * 11);
    positions.setXYZ(index, x * lump, Math.max(y * lump * 0.65, -0.1), z * lump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function starfishGeometry(): BufferGeometry {
  const arms = 5;
  const shape = new Shape();
  for (let point = 0; point <= arms * 2; point += 1) {
    const angle = (point / (arms * 2)) * Math.PI * 2;
    const radius = point % 2 === 0 ? 0.5 : 0.19;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.06,
    bevelSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function props(
  items: readonly Prop[],
  water: WaterUniforms,
  rng: Rng,
  tracker: Tracker,
): { group: Group; starfish: Mesh[] } {
  const group = new Group();
  const starfish: Mesh[] = [];
  const rocks = Array.from({ length: ROCK_VARIANTS }, () => rockGeometry(rng));
  const star = starfishGeometry();
  tracker.geometries.push(...rocks, star);
  const materials = new Map<string, Material>();
  const materialFor = (color: string, roughness: number): Material => {
    const key = `${color}|${roughness}`;
    const existing = materials.get(key);
    if (existing !== undefined) return existing;
    const material = patchMaterial(
      new MeshStandardMaterial({
        color: new Color(color),
        roughness,
        flatShading: roughness > 0.9,
      }),
      [causticsPatch(water)],
    );
    materials.set(key, material);
    tracker.materials.push(material);
    return material;
  };

  for (const item of items) {
    const isStarfish = item.kind === "starfish";
    const geometry = isStarfish ? star : rng.pick(rocks);
    const mesh = new Mesh(geometry, materialFor(item.color, isStarfish ? 0.75 : 0.98));
    mesh.scale.setScalar(item.size);
    mesh.castShadow = !isStarfish;
    mesh.receiveShadow = true;
    mesh.rotation.y = item.rotation;
    mesh.position.set(item.x, floorHeight(item.x, item.z) + (isStarfish ? 0.005 : 0), item.z);
    if (isStarfish) starfish.push(mesh);
    group.add(mesh);
  }
  return { group, starfish };
}

/** The underside of the waves: bright, rippling and fading into the distance. */
function surface(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const size = scene.tank.width * EXTENT;
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: { ...water },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uCausticsScale;
      uniform vec3 uLightColor;
      uniform vec3 uWaterColor;
      varying vec3 vWorld;
      ${CAUSTICS_GLSL}
      void main() {
        float ripple = caustics(vWorld.xz * uCausticsScale * 0.6, uTime * 0.45);
        float distance = length(vWorld.xz - cameraPosition.xz);
        float fade = exp(-distance * 0.09);
        vec3 color = mix(uWaterColor * 2.2, uLightColor, 0.25 + ripple * 0.45);
        gl_FragColor = vec4(color, (0.4 + ripple * 0.35) * fade);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = scene.tank.height;
  mesh.renderOrder = -1;
  tracker.geometries.push(geometry);
  tracker.materials.push(material);
  return mesh;
}

/** Far water: a gradient wall with slow, soft light beams. Colors are linear RGB. */
function backdrop(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const top = scene.backdrop.type === "gradient" ? scene.backdrop.top : scene.water.color;
  const bottom = scene.backdrop.type === "gradient" ? scene.backdrop.bottom : scene.water.color;
  const width = scene.tank.width * EXTENT;
  const height = scene.tank.height * EXTENT;
  const geometry = new PlaneGeometry(width, height);
  const material = new ShaderMaterial({
    uniforms: {
      ...water,
      uTop: { value: new Color(top) },
      uBottom: { value: new Color(bottom) },
      uHeight: { value: height },
    },
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uLightColor;
      varying vec2 vUv;
      uniform vec3 uWaterColor;
      void main() {
        // The horizon (camera height) sits at the middle of the backdrop. It is
        // the fog color there, so the fogged sand blends into it without a seam.
        const float horizon = 0.5;
        float up = smoothstep(horizon, 0.85, vUv.y);
        float down = smoothstep(horizon, 0.2, vUv.y);
        vec3 color = mix(uWaterColor, uTop, up);
        color = mix(color, uBottom, down);
        float y = up;
        float beams = 0.0;
        for (int index = 0; index < 4; index++) {
          float i = float(index);
          float x = vUv.x * (7.0 + i * 3.0) + sin(uTime * 0.05 * (i + 1.0) + i * 1.7) * 2.0;
          beams += pow(max(sin(x + vUv.y * 2.0), 0.0), 12.0) * (0.5 - i * 0.08);
        }
        color += uLightColor * beams * 0.06 * y;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, scene.tank.height / 2, -scene.tank.depth - BACKDROP_DISTANCE);
  mesh.renderOrder = -2;
  tracker.geometries.push(geometry);
  tracker.materials.push(material);
  return mesh;
}

/** Soft additive light shafts slanting down from the surface. */
function lightShafts(scene: Scene, water: WaterUniforms, rng: Rng, tracker: Tracker): Group {
  const group = new Group();
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(0, -0.5, 0);
  tracker.geometries.push(geometry);
  for (let index = 0; index < LIGHT_SHAFT_COUNT; index += 1) {
    const material = new ShaderMaterial({
      uniforms: { ...water, uSeed: { value: rng.range(0, 100) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSeed;
        uniform vec3 uLightColor;
        varying vec2 vUv;
        void main() {
          float across = pow(sin(vUv.x * 3.14159), 2.0);
          float down = pow(vUv.y, 1.6);
          float flicker = 0.6 + 0.4 * sin(uTime * 0.23 + uSeed) * sin(uTime * 0.37 + uSeed * 1.3);
          gl_FragColor = vec4(uLightColor * across * down * flicker * 0.085, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    tracker.materials.push(material);
    const shaft = new Mesh(geometry, material);
    const height = scene.tank.height * rng.range(1.1, 1.5);
    shaft.scale.set(rng.range(0.6, 1.8), height, 1);
    shaft.position.set(
      rng.range(-scene.tank.width / 2, scene.tank.width / 2),
      scene.tank.height + 0.2,
      rng.range(-scene.tank.depth, -scene.tank.depth * 0.2),
    );
    shaft.rotation.z = rng.range(-0.35, -0.15);
    shaft.renderOrder = 2;
    group.add(shaft);
  }
  return group;
}

export function createEnvironment(
  scene: Scene,
  items: readonly Prop[],
  water: WaterUniforms,
  rng: Rng,
): Environment {
  const object = new Group();
  object.name = "environment";
  const tracker: Tracker = { geometries: [], materials: [] };
  const { group: propGroup, starfish } = props(items, water, rng, tracker);
  const starfishRotation = starfish.map((mesh) => mesh.rotation.y);
  const shafts = lightShafts(scene, water, rng, tracker);
  object.add(
    backdrop(scene, water, tracker),
    floor(scene, water, tracker),
    propGroup,
    surface(scene, water, tracker),
    shafts,
  );

  return {
    object,
    update(timeSeconds) {
      // The starfish creeps: a tiny, slow turn you only notice over minutes.
      starfish.forEach((mesh, index) => {
        mesh.rotation.y =
          (starfishRotation[index] ?? 0) + (timeSeconds / STARFISH_TURN_SECONDS) * Math.PI * 2;
      });
    },
    setLightShaftsVisible(visible) {
      shafts.visible = visible;
    },
    dispose() {
      tracker.geometries.forEach((geometry) => {
        geometry.dispose();
      });
      tracker.materials.forEach((material) => {
        material.dispose();
      });
    },
  };
}
