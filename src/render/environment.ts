import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import type { Rng } from "../core/rng";
import type { Scene } from "../scene/schema";
import { floorHeight } from "../sim/terrain";
import { CAUSTICS_GLSL } from "./shaders/caustics";
import { causticsPatch } from "./shaders/causticsPatch";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import { surfacePatch } from "./shaders/surfacePatch";
import type { SurfaceLibrary } from "./surfaceLibrary";
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

export interface Environment {
  readonly object: Group;
  /** Additive light-shaft planes, so depth passes can skip them. */
  readonly lightShafts: Object3D;
  setLightShaftsVisible(visible: boolean): void;
  dispose(): void;
}

interface Tracker {
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
}

/** Fine grain for plain sand, when the scene gives the floor no material. */
const SAND_GRAIN: ShaderPatch = {
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
};

function floor(
  scene: Scene,
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
  tracker: Tracker,
): Mesh {
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
  const sand = scene.floor.material;
  const material = patchMaterial(
    new MeshStandardMaterial({ color: new Color(scene.floor.color), roughness: 0.95 }),
    [
      sand === undefined ? SAND_GRAIN : surfacePatch(surfaces.get(sand.id), "top", sand),
      causticsPatch(water),
    ],
  );
  tracker.geometries.push(geometry);
  tracker.materials.push(material);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** The underside of the waves: bright, rippling and fading into the distance. */
function surface(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const size = scene.tank.width * EXTENT;
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: { ...water, uSurfaceOpacity: { value: scene.water.surface } },
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
      uniform float uSurfaceOpacity;
      varying vec3 vWorld;
      ${CAUSTICS_GLSL}
      void main() {
        float ripple = caustics(vWorld.xz * uCausticsScale * 0.6, uTime * 0.45);
        float distance = length(vWorld.xz - cameraPosition.xz);
        float fade = exp(-distance * 0.09);
        vec3 color = mix(uWaterColor * 2.2, uLightColor, 0.25 + ripple * 0.45);
        gl_FragColor = vec4(color, (0.4 + ripple * 0.35) * fade * uSurfaceOpacity);
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
      uniform float uDaylight;
      uniform vec3 uLightColor;
      varying vec2 vUv;
      uniform vec3 uWaterColor;
      void main() {
        // The horizon (camera height) sits at the middle of the backdrop. It is
        // the fog color there, so the fogged sand blends into it without a seam.
        const float horizon = 0.5;
        float up = smoothstep(horizon, 0.85, vUv.y);
        float down = smoothstep(horizon, 0.2, vUv.y);
        // uWaterColor is already dimmed at night; the gradient ends follow it.
        vec3 color = mix(uWaterColor, uTop * uDaylight, up);
        color = mix(color, uBottom * uDaylight, down);
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
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
  rng: Rng,
): Environment {
  const object = new Group();
  object.name = "environment";
  const tracker: Tracker = { geometries: [], materials: [] };
  const shafts = lightShafts(scene, water, rng, tracker);
  object.add(
    backdrop(scene, water, tracker),
    floor(scene, water, surfaces, tracker),
    surface(scene, water, tracker),
    shafts,
  );

  return {
    object,
    lightShafts: shafts,
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
