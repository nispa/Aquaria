import type { IUniform } from "three";
import type { SurfaceTextures } from "../surfaceLibrary";
import type { ShaderPatch } from "./patch";

/**
 * Photographic surface detail on a built-in PBR material: relief (normal
 * map), grain (brightness detail), roughness and optional displacement. The
 * material's own color keeps the hue, so scenes still choose colors in JSON.
 *
 * Textures are projected in world space, because procedural shapes have no
 * usable UVs: straight down for the sand ("top"), or from the three axes and
 * blended by the surface normal for rocks ("triplanar").
 *
 * Uniforms:
 * - uSurfaceNormal: tangent-space normal map (OpenGL convention).
 * - uSurfaceMap: R = displacement 0..1, G = roughness 0..1, B = brightness detail (0.5 = 1x).
 * - uSurfaceReady (0 or 1): 0 while textures load or if they failed; plain look.
 * - uSurfaceTileScale (1/m): texture repeats per meter.
 * - uSurfaceDisplacement (m, 0..0.2): how far the relief pushes vertices out.
 */

export type SurfaceProjection = "top" | "triplanar";

export interface SurfaceParams {
  /** Size of one texture tile, m. */
  readonly tileSize: number;
  /** Relief height, m; needs finely divided geometry. */
  readonly displacement: number;
}

/** Second, larger sample that breaks up visible tiling on big surfaces. */
const MACRO_SCALE = 0.27;
/** How much the macro sample contributes. */
const MACRO_WEIGHT = 0.4;
/** Sharpness of the triplanar blend: higher = narrower seams. */
const TRIPLANAR_SHARPNESS = 4;
/**
 * Relief exaggeration: underwater fog flattens contrast, so photographic
 * normals read weaker than on land.
 */
const NORMAL_STRENGTH = 1.6;
/** Share of the texture roughness mixed into the material's own roughness. */
const ROUGHNESS_WEIGHT = 0.7;

const SAMPLING_GLSL = /* glsl */ `
  uniform sampler2D uSurfaceNormal;
  uniform sampler2D uSurfaceMap;
  uniform float uSurfaceReady;
  uniform float uSurfaceTileScale;
  uniform float uSurfaceDisplacement;

  vec3 surfaceWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(${TRIPLANAR_SHARPNESS.toFixed(1)}));
    return w / (w.x + w.y + w.z);
  }

  vec4 surfaceSample(sampler2D map, vec3 p, vec3 n) {
    p *= uSurfaceTileScale;
    #ifdef SURFACE_TOP
      vec4 near = texture2D(map, p.xz);
      vec4 far = texture2D(map, p.zx * ${MACRO_SCALE.toFixed(2)} + 0.31);
      return mix(near, far, ${MACRO_WEIGHT.toFixed(2)});
    #else
      vec3 w = surfaceWeights(n);
      return texture2D(map, p.zy) * w.x + texture2D(map, p.xz) * w.y + texture2D(map, p.xy) * w.z;
    #endif
  }

  vec3 surfaceTangent(vec2 uv) {
    vec3 t = texture2D(uSurfaceNormal, uv).xyz * 2.0 - 1.0;
    return vec3(t.xy * ${NORMAL_STRENGTH.toFixed(2)}, t.z);
  }

  // Whiteout blend of tangent-space normals onto each projection axis
  // (Golus, "Normal Mapping for a Triplanar Shader").
  vec3 surfaceWorldNormal(vec3 p, vec3 n) {
    p *= uSurfaceTileScale;
    #ifdef SURFACE_TOP
      vec3 t = mix(
        surfaceTangent(p.xz),
        surfaceTangent(p.zx * ${MACRO_SCALE.toFixed(2)} + 0.31).yxz,
        ${MACRO_WEIGHT.toFixed(2)}
      );
      vec3 top = vec3(t.xy + n.xz, abs(t.z) * n.y);
      return normalize(top.xzy);
    #else
      vec3 w = surfaceWeights(n);
      vec3 tx = surfaceTangent(p.zy);
      vec3 ty = surfaceTangent(p.xz);
      vec3 tz = surfaceTangent(p.xy);
      tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
      ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
      tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
      return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
    #endif
  }
`;

export function surfacePatch(
  textures: SurfaceTextures,
  projection: SurfaceProjection,
  params: SurfaceParams,
): ShaderPatch {
  const uniforms: Record<string, IUniform> = {
    uSurfaceNormal: textures.normal,
    uSurfaceMap: textures.surface,
    uSurfaceReady: textures.ready,
    uSurfaceTileScale: { value: 1 / params.tileSize },
    uSurfaceDisplacement: { value: params.displacement },
  };
  const define = projection === "top" ? "#define SURFACE_TOP\n" : "";
  return {
    name: `surface-${projection}`,
    uniforms,
    vertexHead: /* glsl */ `
      ${define}
      ${SAMPLING_GLSL}
      varying vec3 vSurfacePosition;
      varying vec3 vSurfaceNormal;
    `,
    vertex: [
      [
        "#include <displacementmap_vertex>",
        /* glsl */ `
        #include <displacementmap_vertex>
        {
          mat4 surfaceModel = modelMatrix;
          #ifdef USE_INSTANCING
            surfaceModel = modelMatrix * instanceMatrix;
          #endif
          vec3 worldNormal = normalize(mat3(surfaceModel) * objectNormal);
          vec3 worldPosition = (surfaceModel * vec4(transformed, 1.0)).xyz;
          if (uSurfaceDisplacement > 0.0 && uSurfaceReady > 0.5) {
            // Centred on mid-grey so shapes keep roughly their volume.
            float height = surfaceSample(uSurfaceMap, worldPosition, worldNormal).r - 0.5;
            float objectScale = length(surfaceModel[0].xyz);
            transformed += objectNormal * height * uSurfaceDisplacement / objectScale;
            worldPosition = (surfaceModel * vec4(transformed, 1.0)).xyz;
          }
          vSurfacePosition = worldPosition;
          vSurfaceNormal = worldNormal;
        }
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      ${define}
      ${SAMPLING_GLSL}
      varying vec3 vSurfacePosition;
      varying vec3 vSurfaceNormal;
    `,
    fragment: [
      [
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        vec4 surfaceData = surfaceSample(uSurfaceMap, vSurfacePosition, normalize(vSurfaceNormal));
        diffuseColor.rgb *= mix(1.0, surfaceData.b * 2.0, uSurfaceReady);
        `,
      ],
      [
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(
          roughnessFactor,
          mix(roughnessFactor, surfaceData.g, ${ROUGHNESS_WEIGHT.toFixed(2)}),
          uSurfaceReady
        );
        `,
      ],
      [
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        if (uSurfaceReady > 0.5) {
          vec3 worldNormal = surfaceWorldNormal(vSurfacePosition, normalize(vSurfaceNormal));
          normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif
        }
        `,
      ],
    ],
  };
}
