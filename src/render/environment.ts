import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import type { Rng } from "../core/rng";
import type { Scene } from "../scene/schema";
import type { FloorHeight } from "../sim/terrain";
import { CAUSTICS_GLSL } from "./shaders/caustics";
import type { ContactGrid } from "./contactShade";
import { causticsPatch } from "./shaders/causticsPatch";
import { contactShadePatch, type ContactShadeUniforms } from "./shaders/contactShadePatch";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import { surfacePatch } from "./shaders/surfacePatch";
import { WAVE_SURFACE_FRAGMENT, WAVE_SURFACE_VERTEX } from "./shaders/waveSurface";
import type { SurfaceLibrary } from "./surfaceLibrary";
import type { WaterUniforms } from "./uniforms";

/** The largest value a byte of a texture holds. */
const BYTE = 255;
/** How far the sand, surface and backdrop extend beyond the tank, in tank sizes. */
const EXTENT = 6;
/**
 * ...and at least this far, m, so a small tank never shows their edges; the
 * large scenes already reach past it.
 */
const MIN_SPAN = 30;
const span = (size: number): number => Math.max(size * EXTENT, MIN_SPAN);
/** Distance of the backdrop behind the back of the tank, m. */
const BACKDROP_DISTANCE = 10;
const LIGHT_SHAFT_COUNT = 7;
/** Sand in front of the glass, m, so the floor never ends inside the view. */
const FLOOR_FRONT_OVERHANG = 2;
/** Gap between the far end of the sand and the backdrop, m (hidden by fog). */
const BACKDROP_GAP = 1;
/** How far the back panel reaches above the surface and below the sand, m. */
const PANEL_OVERHANG = 0.3;
/** The sand tucks this far under the back panel, m, so no gap shows at the seam. */
const PANEL_TUCK = 0.01;
/** Grid cells across and along the floor. */
const FLOOR_SEGMENTS = { across: 240, along: 120 } as const;
/** Grid cells along each side of the wave surface: fine enough for the shortest waves near the tank. */
const WAVE_SEGMENTS = 256;
/** Where the sun glares through the surface: over the middle, towards the back, in tank sizes. */
const GLARE_DEPTH_SHARE = 0.55;
const GLARE_RADIUS_SHARE = 0.35;

export interface Environment {
  readonly object: Group;
  /** Additive light-shaft planes, so depth passes can skip them. */
  readonly lightShafts: Object3D;
  /**
   * The surface and the open-water backdrop: water painted on far shells,
   * not things that shade each other, so ambient occlusion can skip them.
   */
  readonly paintedWater: readonly Object3D[];
  setLightShaftsVisible(visible: boolean): void;
  /** The surface moved by waves (the "waves" feature), or the plain rippling one. */
  setWavesVisible(visible: boolean): void;
  /** Darkens the sand round what stands on it (render/contactShade), when the scene asks for it. */
  setContactShade(grid: ContactGrid): void;
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

/** Whether the scene is a closed home tank, with a panel on its back glass. */
const isClosed = (scene: Scene): boolean => scene.backdrop.type === "panel";

/** x folded back inside the tank's walls, as the side glass mirrors the floor. */
export function mirrored(x: number, halfWidth: number): number {
  const period = 4 * halfWidth;
  const folded = (((x + halfWidth) % period) + period) % period;
  return folded <= 2 * halfWidth ? folded - halfWidth : 3 * halfWidth - folded;
}

function floor(
  scene: Scene,
  height: FloorHeight,
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
  tracker: Tracker,
  contact: ContactShadeUniforms,
): Mesh {
  const closed = isClosed(scene);
  const halfWidth = scene.tank.width / 2;
  // A closed tank's side glass mirrors its floor: a little to each side is enough.
  const width = closed ? scene.tank.width * EXTENT : span(scene.tank.width);
  // Open water: the sand stops just short of the backdrop, since where the two
  // meet, depth-based effects (ambient occlusion) would draw a crease along
  // the horizon. A closed tank's sand ends under its back panel.
  const behind = closed ? PANEL_TUCK : BACKDROP_DISTANCE - BACKDROP_GAP;
  const depth = scene.tank.depth + behind + FLOOR_FRONT_OVERHANG;
  const geometry = new PlaneGeometry(width, depth, FLOOR_SEGMENTS.across, FLOOR_SEGMENTS.along);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -depth / 2 + FLOOR_FRONT_OVERHANG);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    positions.setY(index, height(closed ? mirrored(x, halfWidth) : x, positions.getZ(index)));
  }
  geometry.computeVertexNormals();
  const sand = scene.floor.material;
  const material = patchMaterial(
    new MeshStandardMaterial({ color: new Color(scene.floor.color), roughness: 0.95 }),
    [
      sand === undefined ? SAND_GRAIN : surfacePatch(surfaces.get(sand.id), "top", sand),
      causticsPatch(water),
      ...(scene.floor.contact > 0 ? [contactShadePatch(contact)] : []),
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
  const size = span(scene.tank.width);
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: { ...water, uSurfaceOpacity: { value: scene.water.surface } },
    transparent: true,
    // Its depth tells the deep-water light how far the surface is.
    depthWrite: true,
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

/** The underside of the surface moved by waves, with Snell's window and the sun's glare. */
function waveSurface(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const size = span(scene.tank.width);
  const geometry = new PlaneGeometry(size, size, WAVE_SEGMENTS, WAVE_SEGMENTS);
  geometry.rotateX(Math.PI / 2);
  const { waves } = scene.water;
  const material = new ShaderMaterial({
    uniforms: {
      ...water,
      uWaveHeight: { value: waves.height },
      uWaveLength: { value: waves.length },
      uWaveSpeed: { value: waves.speed },
      uGlare: { value: waves.glare },
      uGlareCenter: { value: new Vector2(0, -scene.tank.depth * GLARE_DEPTH_SHARE) },
      uGlareRadius: { value: scene.tank.width * GLARE_RADIUS_SHARE },
      uWindow: { value: waves.window },
      uSurfaceOpacity: { value: scene.water.surface },
    },
    transparent: true,
    // Its depth tells the deep-water light how far the surface is.
    depthWrite: true,
    side: DoubleSide,
    vertexShader: WAVE_SURFACE_VERTEX,
    fragmentShader: WAVE_SURFACE_FRAGMENT,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = scene.tank.height;
  mesh.renderOrder = -1;
  // The waves move the vertices in the shader, beyond the plane's bounds.
  mesh.frustumCulled = false;
  tracker.geometries.push(geometry);
  tracker.materials.push(material);
  return mesh;
}

/** Far water: a gradient wall with slow, soft light beams. Colors are linear RGB. */
function backdrop(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const top = scene.backdrop.type === "gradient" ? scene.backdrop.top : scene.water.color;
  const bottom = scene.backdrop.type === "gradient" ? scene.backdrop.bottom : scene.water.color;
  const width = span(scene.tank.width);
  // The gradient's horizon depends on the height: kept in tank sizes.
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

/**
 * The panel on the back glass of a closed tank, a gradient from the sand to
 * the surface. Wider than the tank, as the side glass mirrors it. It is a
 * solid wall: it hides the surface and the shafts behind it.
 */
function panel(scene: Scene, water: WaterUniforms, tracker: Tracker): Mesh {
  const top = scene.backdrop.type === "panel" ? scene.backdrop.top : scene.water.color;
  const bottom = scene.backdrop.type === "panel" ? scene.backdrop.bottom : scene.water.color;
  const height = scene.tank.height + 2 * PANEL_OVERHANG;
  const geometry = new PlaneGeometry(scene.tank.width * EXTENT, height);
  const material = new ShaderMaterial({
    uniforms: {
      ...water,
      uTop: { value: new Color(top) },
      uBottom: { value: new Color(bottom) },
      uOverhang: { value: PANEL_OVERHANG / height },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform float uDaylight;
      uniform float uOverhang;
      varying vec2 vUv;
      void main() {
        float up = smoothstep(uOverhang, 1.0 - uOverhang, vUv.y);
        gl_FragColor = vec4(mix(uBottom, uTop, up) * uDaylight, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, scene.tank.height / 2, -scene.tank.depth);
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
          // max(): pow of a negative base is NaN on some GPUs.
          float across = pow(max(sin(vUv.x * 3.14159), 0.0), 2.0);
          float down = pow(max(vUv.y, 0.0), 1.6);
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
  floorHeight: FloorHeight,
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
  rng: Rng,
): Environment {
  const object = new Group();
  object.name = "environment";
  const tracker: Tracker = { geometries: [], materials: [] };
  const shafts = lightShafts(scene, water, rng, tracker);
  const contact: ContactShadeUniforms = {
    uContactShade: { value: null },
    uContactArea: { value: [0, 0, 1, 1] },
  };
  let contactTexture: DataTexture | undefined;
  const plainSurface = surface(scene, water, tracker);
  const wavySurface = waveSurface(scene, water, tracker);
  wavySurface.visible = false;
  const openWater = isClosed(scene) ? undefined : backdrop(scene, water, tracker);
  object.add(
    openWater ?? panel(scene, water, tracker),
    floor(scene, floorHeight, water, surfaces, tracker, contact),
    plainSurface,
    wavySurface,
    shafts,
  );

  return {
    object,
    lightShafts: shafts,
    paintedWater: [plainSurface, wavySurface, ...(openWater === undefined ? [] : [openWater])],
    setLightShaftsVisible(visible) {
      shafts.visible = visible;
    },
    setWavesVisible(visible) {
      wavySurface.visible = visible;
      plainSurface.visible = !visible;
    },
    setContactShade(grid) {
      const light = new Uint8Array(grid.values.length);
      grid.values.forEach((value, index) => {
        light[index] = Math.round(value * BYTE);
      });
      contactTexture?.dispose();
      contactTexture = new DataTexture(light, grid.columns, grid.rows, RedFormat, UnsignedByteType);
      contactTexture.magFilter = LinearFilter;
      contactTexture.minFilter = LinearFilter;
      contactTexture.needsUpdate = true;
      contact.uContactShade.value = contactTexture;
      contact.uContactArea.value = [
        grid.minX,
        grid.minZ,
        grid.columns * grid.cell,
        grid.rows * grid.cell,
      ];
    },
    dispose() {
      contactTexture?.dispose();
      tracker.geometries.forEach((geometry) => {
        geometry.dispose();
      });
      tracker.materials.forEach((material) => {
        material.dispose();
      });
    },
  };
}
