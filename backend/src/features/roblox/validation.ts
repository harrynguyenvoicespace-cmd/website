import { HttpError, parseIntegerEnv } from "../../core/http";
import type { RuntimeEnv } from "../../types";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export type RobloxValidationAssetType = "accessory" | "body_part" | "layered_clothing" | "model";

type ValidationRules = {
  maxFileBytes: number;
  maxTriangles: number;
  maxVertices: number;
  maxMeshes: number;
  maxMaterials: number;
  maxTextures: number;
  maxBones: number;
  maxBoundsStuds: { x: number; y: number; z: number };
};

type GltfJson = {
  accessors?: Array<{
    count?: number;
    type?: string;
    componentType?: number;
    min?: number[];
    max?: number[];
  }>;
  meshes?: Array<{
    name?: string;
    primitives?: Array<{
      attributes?: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
      targets?: Array<Record<string, number>>;
    }>;
  }>;
  materials?: unknown[];
  textures?: unknown[];
  images?: unknown[];
  skins?: Array<{ joints?: number[] }>;
  animations?: unknown[];
};

type ValidationIssue = {
  severity: "pass" | "warning" | "fail";
  code: string;
  label: string;
  message: string;
  value?: number | string;
  limit?: number | string;
};

export const robloxValidationRules = (env: RuntimeEnv, assetType: RobloxValidationAssetType = "accessory") => {
  const maxFileBytes = parseIntegerEnv(env.ROBLOX_MAX_MODEL_BYTES, DEFAULT_MAX_BYTES, 1);
  const presets: Record<RobloxValidationAssetType, ValidationRules> = {
    accessory: {
      maxFileBytes,
      maxTriangles: 4_000,
      maxVertices: 8_000,
      maxMeshes: 8,
      maxMaterials: 8,
      maxTextures: 8,
      maxBones: 0,
      maxBoundsStuds: { x: 8, y: 8, z: 8 },
    },
    body_part: {
      maxFileBytes,
      maxTriangles: 10_000,
      maxVertices: 20_000,
      maxMeshes: 16,
      maxMaterials: 12,
      maxTextures: 12,
      maxBones: 128,
      maxBoundsStuds: { x: 12, y: 12, z: 12 },
    },
    layered_clothing: {
      maxFileBytes,
      maxTriangles: 10_000,
      maxVertices: 20_000,
      maxMeshes: 16,
      maxMaterials: 12,
      maxTextures: 12,
      maxBones: 128,
      maxBoundsStuds: { x: 12, y: 12, z: 12 },
    },
    model: {
      maxFileBytes,
      maxTriangles: 20_000,
      maxVertices: 40_000,
      maxMeshes: 32,
      maxMaterials: 16,
      maxTextures: 16,
      maxBones: 128,
      maxBoundsStuds: { x: 24, y: 24, z: 24 },
    },
  };

  return presets[assetType] ?? presets.accessory;
};

export const robloxValidationMetadata = (env: RuntimeEnv) => ({
  source: "local_worker_gltf_validator",
  caveat:
    "AvatarCreationService:GetValidationRules is a Roblox Engine/Studio API, not an Open Cloud HTTP endpoint. Paste Studio-exported rules into rulesJson for exact project rules.",
  rules: {
    accessory: robloxValidationRules(env, "accessory"),
    body_part: robloxValidationRules(env, "body_part"),
    layered_clothing: robloxValidationRules(env, "layered_clothing"),
    model: robloxValidationRules(env, "model"),
  },
  studio_script: [
    "local AvatarCreationService = game:GetService(\"AvatarCreationService\")",
    "local HttpService = game:GetService(\"HttpService\")",
    "local rules = AvatarCreationService:GetValidationRules(Enum.AssetType.Model)",
    "print(HttpService:JSONEncode(rules))",
  ].join("\n"),
});

export const validateRobloxModelFile = async (
  env: RuntimeEnv,
  input: {
    file: File;
    assetType?: string;
    rulesJson?: string;
  },
) => {
  const assetType = normalizeAssetType(input.assetType);
  const rules = parseRules(input.rulesJson) ?? robloxValidationRules(env, assetType);
  const lowerName = input.file.name.toLowerCase();

  if (!lowerName.endsWith(".glb") && !lowerName.endsWith(".gltf")) {
    throw new HttpError(
      415,
      "validator_format_not_supported",
      "Validator currently supports .glb and .gltf for exact mesh checks. Convert FBX/RBXM to GLB/GLTF first.",
    );
  }

  const gltf = lowerName.endsWith(".glb")
    ? parseGlb(await input.file.arrayBuffer())
    : JSON.parse(await input.file.text()) as GltfJson;
  const stats = collectGltfStats(gltf, input.file.size);
  const issues = evaluateStats(stats, rules);
  const failed = issues.some((issue) => issue.severity === "fail");
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return {
    asset_type: assetType,
    status: failed ? "failed" : warnings > 0 ? "warning" : "passed",
    can_upload_candidate: !failed,
    file: {
      name: input.file.name,
      size: input.file.size,
      type: input.file.type || modelContentTypeFromName(input.file.name),
    },
    stats,
    rules,
    issues,
    note:
      "This checks GLB/GLTF geometry against the active rule preset. Roblox Studio can still reject assets for moderation, cage, attachment, layered clothing, or Marketplace-specific rules.",
  };
};

const normalizeAssetType = (value: string | undefined): RobloxValidationAssetType => {
  const normalized = String(value || "accessory").trim().toLowerCase().replace(/[-\s]/g, "_");
  if (normalized === "body" || normalized === "bodypart") return "body_part";
  if (normalized === "layered" || normalized === "clothing") return "layered_clothing";
  if (normalized === "model") return "model";
  return "accessory";
};

const parseRules = (value: string | undefined): ValidationRules | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as Partial<ValidationRules>;
  return {
    maxFileBytes: numberOr(parsed.maxFileBytes, DEFAULT_MAX_BYTES),
    maxTriangles: numberOr(parsed.maxTriangles, 4_000),
    maxVertices: numberOr(parsed.maxVertices, 8_000),
    maxMeshes: numberOr(parsed.maxMeshes, 8),
    maxMaterials: numberOr(parsed.maxMaterials, 8),
    maxTextures: numberOr(parsed.maxTextures, 8),
    maxBones: numberOr(parsed.maxBones, 0),
    maxBoundsStuds: {
      x: numberOr(parsed.maxBoundsStuds?.x, 8),
      y: numberOr(parsed.maxBoundsStuds?.y, 8),
      z: numberOr(parsed.maxBoundsStuds?.z, 8),
    },
  };
};

const numberOr = (value: unknown, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const parseGlb = (buffer: ArrayBuffer): GltfJson => {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new HttpError(400, "invalid_glb", "File is not a valid GLB container");
  }

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > view.byteLength) {
      throw new HttpError(400, "invalid_glb_chunk", "GLB chunk extends past end of file");
    }
    if (chunkType === GLB_JSON_CHUNK) {
      const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer, offset, chunkLength)).replace(/\0+$/g, "");
      return JSON.parse(text) as GltfJson;
    }
    offset += chunkLength;
  }

  throw new HttpError(400, "missing_glb_json", "GLB does not contain a JSON chunk");
};

const collectGltfStats = (gltf: GltfJson, fileBytes: number) => {
  const accessors = gltf.accessors ?? [];
  let vertices = 0;
  let triangles = 0;
  let primitives = 0;
  let morphTargets = 0;
  const materialSet = new Set<number>();
  const names: string[] = [];
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let hasBounds = false;

  for (const mesh of gltf.meshes ?? []) {
    if (mesh.name) names.push(mesh.name);
    for (const primitive of mesh.primitives ?? []) {
      primitives += 1;
      const positionAccessorIndex = primitive.attributes?.POSITION;
      const positionAccessor = typeof positionAccessorIndex === "number" ? accessors[positionAccessorIndex] : undefined;
      const vertexCount = Math.max(0, Math.floor(positionAccessor?.count ?? 0));
      vertices += vertexCount;

      if (positionAccessor?.min?.length === 3 && positionAccessor.max?.length === 3) {
        hasBounds = true;
        for (let index = 0; index < 3; index += 1) {
          min[index] = Math.min(min[index], Number(positionAccessor.min[index]));
          max[index] = Math.max(max[index], Number(positionAccessor.max[index]));
        }
      }

      if (typeof primitive.material === "number") materialSet.add(primitive.material);
      morphTargets += primitive.targets?.length ?? 0;

      const mode = primitive.mode ?? 4;
      const indexAccessor = typeof primitive.indices === "number" ? accessors[primitive.indices] : undefined;
      const indexCount = Math.max(0, Math.floor(indexAccessor?.count ?? vertexCount));
      if (mode === 4) triangles += Math.floor(indexCount / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, indexCount - 2);
    }
  }

  const bounds = hasBounds
    ? {
        min,
        max,
        size: max.map((value, index) => Math.max(0, value - min[index])),
      }
    : null;

  return {
    fileBytes,
    meshes: gltf.meshes?.length ?? 0,
    primitives,
    vertices,
    triangles,
    materials: Math.max(gltf.materials?.length ?? 0, materialSet.size),
    textures: gltf.textures?.length ?? 0,
    images: gltf.images?.length ?? 0,
    skins: gltf.skins?.length ?? 0,
    bones: Math.max(0, ...((gltf.skins ?? []).map((skin) => skin.joints?.length ?? 0))),
    animations: gltf.animations?.length ?? 0,
    morphTargets,
    bounds,
    meshNames: names.slice(0, 20),
  };
};

const evaluateStats = (stats: ReturnType<typeof collectGltfStats>, rules: ValidationRules): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  checkLimit(issues, "file_bytes", "File size", stats.fileBytes, rules.maxFileBytes, "fail");
  checkLimit(issues, "triangles", "Triangles", stats.triangles, rules.maxTriangles, "fail");
  checkLimit(issues, "vertices", "Vertices", stats.vertices, rules.maxVertices, "fail");
  checkLimit(issues, "meshes", "Meshes", stats.meshes, rules.maxMeshes, "warning");
  checkLimit(issues, "materials", "Materials", stats.materials, rules.maxMaterials, "warning");
  checkLimit(issues, "textures", "Textures", stats.textures, rules.maxTextures, "warning");
  checkLimit(issues, "bones", "Bones", stats.bones, rules.maxBones, rules.maxBones === 0 ? "fail" : "warning");

  if (stats.bounds) {
    const axes = ["x", "y", "z"] as const;
    axes.forEach((axis, index) => {
      checkLimit(
        issues,
        `bounds_${axis}`,
        `Bounds ${axis.toUpperCase()}`,
        Number(stats.bounds?.size[index] ?? 0),
        rules.maxBoundsStuds[axis],
        "warning",
      );
    });
  } else {
    issues.push({
      severity: "warning",
      code: "bounds_missing",
      label: "Bounds",
      message: "GLTF accessors do not include min/max bounds, so scale checks are incomplete.",
    });
  }

  if (stats.morphTargets > 0) {
    issues.push({
      severity: "warning",
      code: "morph_targets_present",
      label: "Morph targets",
      message: "Morph targets may not be valid for every Roblox UGC asset type.",
      value: stats.morphTargets,
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "pass",
      code: "basic_geometry_pass",
      label: "Basic geometry",
      message: "Mesh is inside the active local geometry preset.",
    });
  }
  return issues;
};

const checkLimit = (
  issues: ValidationIssue[],
  code: string,
  label: string,
  value: number,
  limit: number,
  severity: "warning" | "fail",
) => {
  if (limit <= 0 && value <= 0) return;
  if (value <= limit) return;
  issues.push({
    severity,
    code,
    label,
    message: `${label} is over the active Roblox preset limit.`,
    value,
    limit,
  });
};

const modelContentTypeFromName = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".gltf")) return "model/gltf+json";
  if (lowerName.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
};
