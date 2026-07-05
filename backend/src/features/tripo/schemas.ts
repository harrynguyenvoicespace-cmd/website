import { z } from "zod";

export const MODEL_ALIASES = [
  "P1-20260311",
  "v2.5-20250123",
  "v3.0-20250812",
  "v3.1-20260211",
] as const;

export const TRIPO_MODEL_ALIASES: Record<string, (typeof MODEL_ALIASES)[number]> = {
  "tripo-p1": "P1-20260311",
  "tripo-v2.5": "v2.5-20250123",
  "tripo-v3.0": "v3.0-20250812",
  "tripo-v3.1": "v3.1-20260211",
  "tripo-v2.0": "v2.5-20250123",
  "tripo-turbo": "v3.1-20260211",
  "Turbo-v1.0-20250506": "v3.1-20260211",
  "v2.0-20240919": "v2.5-20250123",
};

export const normalizeTripoModel = (model: unknown) => {
  if (typeof model !== "string") {
    return model;
  }
  return TRIPO_MODEL_ALIASES[model] ?? model;
};

const LooseObjectSchema = z.record(z.unknown());
const TaskInputSchema = z.string().trim().min(1).max(4096);
const OptionalTaskInputSchema = TaskInputSchema.optional();
const PartNamesSchema = z.array(z.string().trim().min(1)).min(1).max(128).optional();

export const BaseTaskSchema = LooseObjectSchema;

const ModelOptionSchema = z.object({
  model: z.string().trim().min(1).optional(),
  model_version: z.string().trim().min(1).optional(),
});

const CommonGenerationSchema = ModelOptionSchema.extend({
  face_limit: z.number().int().min(48).max(200_000).optional(),
  texture: z.boolean().optional(),
  pbr: z.boolean().optional(),
  model_seed: z.number().int().optional(),
  image_seed: z.number().int().optional(),
  texture_seed: z.number().int().optional(),
  texture_quality: z.enum(["standard", "detailed", "extreme"]).optional(),
  geometry_quality: z.enum(["standard", "detailed"]).optional(),
  auto_size: z.boolean().optional(),
  quad: z.boolean().optional(),
  smart_low_poly: z.boolean().optional(),
  generate_parts: z.boolean().optional(),
  compress: z.enum(["geometry"]).optional(),
  export_uv: z.boolean().optional(),
}).passthrough();

export const TextToModelSchema = CommonGenerationSchema.extend({
  prompt: z.string().trim().min(1).max(1024),
  negative_prompt: z.string().trim().max(255).optional(),
});

export const ImageToModelSchema = CommonGenerationSchema.extend({
  input: OptionalTaskInputSchema,
  image_url: z.string().url().optional(),
  image_token: z.string().trim().min(1).optional(),
  file_token: z.string().trim().min(1).optional(),
  file: z
    .object({
      type: z.string().trim().min(1).optional(),
      file_token: z.string().trim().min(1).optional(),
      url: z.string().url().optional(),
      object: z
        .object({
          bucket: z.string().trim().min(1),
          key: z.string().trim().min(1),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
  enable_image_autofix: z.boolean().optional(),
  texture_alignment: z.enum(["original_image", "geometry"]).optional(),
  orientation: z.enum(["default", "align_image"]).optional(),
}).refine(
  (body) =>
    [body.input, body.image_url, body.image_token, body.file_token, body.file].filter(Boolean).length === 1,
  "Exactly one image input is required",
);

const MultiviewInputValueSchema = z.union([
  z.string().trim(),
  z.object({ url: z.string().url().optional(), file_token: z.string().trim().min(1).optional() }).passthrough(),
]);
const MultiviewKeyedInputSchema = z
  .object({
    front: MultiviewInputValueSchema.optional(),
    left: MultiviewInputValueSchema.optional(),
    back: MultiviewInputValueSchema.optional(),
    right: MultiviewInputValueSchema.optional(),
  })
  .passthrough();

export const MultiviewToModelSchema = CommonGenerationSchema.extend({
  inputs: z.union([z.array(z.string()), z.array(MultiviewKeyedInputSchema)]).optional(),
  original_task_id: z.string().trim().min(1).optional(),
  texture_alignment: z.enum(["original_image", "geometry"]).optional(),
  orientation: z.enum(["default", "align_image"]).optional(),
}).refine((body) => !!body.inputs || !!body.original_task_id, "inputs or original_task_id is required");

export const TextToImageSchema = ModelOptionSchema.extend({
  prompt: z.string().trim().min(1).max(1024),
  template: z
    .enum(["asset_extraction", "character_completion", "t_pose", "head_extraction", "3d_enhance", "variants", "print_clay", "figure"])
    .optional(),
  t_pose: z.boolean().optional(),
  sketch_to_render: z.boolean().optional(),
}).passthrough();

export const ImageToImageSchema = ModelOptionSchema.extend({
  input: OptionalTaskInputSchema,
  inputs: z.array(TaskInputSchema).min(1).max(10).optional(),
  prompt: z.string().trim().max(1024).optional(),
  template: z
    .enum(["asset_extraction", "character_completion", "t_pose", "head_extraction", "3d_enhance", "variants", "print_clay", "figure"])
    .optional(),
  t_pose: z.boolean().optional(),
  sketch_to_render: z.boolean().optional(),
}).passthrough();

export const InputOnlySchema = z.object({ input: TaskInputSchema }).passthrough();

export const TextureModelSchema = ModelOptionSchema.extend({
  input: TaskInputSchema,
  texture_seed: z.number().int().optional(),
  texture_quality: z.enum(["standard", "detailed", "extreme"]).optional(),
  pbr: z.boolean().optional(),
}).passthrough();

export const MeshSegmentSchema = ModelOptionSchema.extend({
  input: TaskInputSchema,
}).passthrough();

export const MeshCompleteSchema = ModelOptionSchema.extend({
  input: TaskInputSchema,
  part_names: PartNamesSchema,
}).passthrough();

export const MeshDecimateSchema = ModelOptionSchema.extend({
  input: TaskInputSchema,
  face_limit: z.number().int().min(48).max(200_000).optional(),
  quad: z.boolean().optional(),
  part_names: PartNamesSchema,
  bake: z.boolean().optional(),
}).passthrough();

export const ConvertModelSchema = z
  .object({
    input: TaskInputSchema,
    format: z.enum(["GLTF", "USDZ", "FBX", "OBJ", "STL", "3MF"]),
    quad: z.boolean().optional(),
    force_symmetry: z.boolean().optional(),
    face_limit: z.number().int().min(48).max(200_000).optional(),
    flatten_bottom: z.boolean().optional(),
    flatten_bottom_threshold: z.number().min(0).max(1).optional(),
    texture_size: z.number().int().min(64).max(8192).optional(),
    texture_format: z.enum(["BMP", "DPX", "HDR", "JPEG", "PNG", "TARGA", "TIFF", "WEBP"]).optional(),
    bake: z.boolean().optional(),
    pack_uv: z.boolean().optional(),
    export_vertex_colors: z.boolean().optional(),
    pivot_to_center_bottom: z.boolean().optional(),
    scale_factor: z.number().min(0.001).max(1000).optional(),
    with_animation: z.boolean().optional(),
    animate_in_place: z.boolean().optional(),
    part_names: PartNamesSchema,
    export_orientation: z.enum(["-x", "-y", "+y"]).optional(),
    fbx_preset: z.enum(["blender", "3dsmax", "mixamo"]).optional(),
  })
  .passthrough();

export const ImportModelSchema = InputOnlySchema;

export const RigCheckSchema = InputOnlySchema;

export const RigModelSchema = ModelOptionSchema.extend({
  input: TaskInputSchema,
  rig_type: z.enum(["biped", "quadruped", "hexapod", "octopod", "avian", "serpentine", "aquatic"]).optional(),
  spec: z.enum(["tripo", "mixamo"]).optional(),
  out_format: z.enum(["glb", "fbx"]).optional(),
}).passthrough();

export const RetargetAnimationSchema = z
  .object({
    input: TaskInputSchema,
    animation: z.string().trim().min(1).optional(),
    animations: z.array(z.string().trim().min(1)).min(1).max(128).optional(),
    out_format: z.enum(["glb", "fbx"]).optional(),
    bake_animation: z.boolean().optional(),
    export_with_geometry: z.boolean().optional(),
    animate_in_place: z.boolean().optional(),
  })
  .passthrough()
  .refine((body) => !!body.animation !== !!body.animations, "Exactly one of animation or animations is required");

export const BatchTasksSchema = z.object({
  task_ids: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const RawTaskSchema = z
  .object({
    type: z.string().trim().min(1).describe("Compatibility Tripo task type"),
  })
  .passthrough();

export const normalizeZodError = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
