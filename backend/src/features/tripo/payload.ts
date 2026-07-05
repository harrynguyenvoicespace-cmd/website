import { z } from "zod";
import { HttpError } from "../../core/http";
import { compactTaskPayload } from "./client";
import { normalizeTripoModel, normalizeZodError } from "./schemas";

const OMIT_FALSE_BOOLEAN_FIELDS = [
  "animate_in_place",
  "auto_size",
  "export_vertex_colors",
  "flatten_bottom",
  "force_symmetry",
  "generate_parts",
  "pack_uv",
  "quad",
  "sketch_to_render",
  "smart_low_poly",
  "t_pose",
];

const P_SERIES_UNSUPPORTED_FIELDS = ["quad", "smart_low_poly"];
const P_SERIES_ALLOWED_FIELDS = new Set([
  "file",
  "file_token",
  "face_limit",
  "image_token",
  "image_url",
  "input",
  "inputs",
  "model",
  "model_seed",
  "original_task_id",
  "prompt",
  "texture",
  "type",
]);

const TEXTURE_DISABLED_FIELDS = ["export_uv", "texture_alignment", "texture_quality", "texture_seed"];

export const parseSchema = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "validation_error", "Request validation failed", normalizeZodError(parsed.error));
  }
  return parsed.data;
};

export const normalizeModelAlias = (input: Record<string, unknown>) => {
  const payload = { ...input };
  const legacyModel = normalizeTripoModel(payload.model_version);
  delete payload.model_version;
  if (!payload.model && legacyModel) {
    payload.model = legacyModel;
  } else if (payload.model) {
    payload.model = normalizeTripoModel(payload.model);
  }
  for (const key of OMIT_FALSE_BOOLEAN_FIELDS) {
    if (payload[key] === false) delete payload[key];
  }
  if (payload.texture === false) {
    for (const key of TEXTURE_DISABLED_FIELDS) delete payload[key];
    payload.pbr = false;
  }
  if (payload.model === "P1-20260311") {
    for (const key of P_SERIES_UNSUPPORTED_FIELDS) delete payload[key];
    for (const key of Object.keys(payload)) {
      if (!P_SERIES_ALLOWED_FIELDS.has(key)) delete payload[key];
    }
  }
  return compactTaskPayload(payload);
};

export const buildTextToModelPayload = (input: Record<string, unknown>) => {
  const payload = normalizeModelAlias(input);
  if (!payload.model) payload.model = "v3.1-20260211";
  return compactTaskPayload(payload);
};

export const buildImageToModelPayload = (input: Record<string, unknown>) => {
  const payload = normalizeModelAlias(input);
  const file = input.file as Record<string, unknown> | undefined;
  payload.input = input.input ?? input.file_token ?? input.image_token ?? input.image_url ?? file?.file_token ?? file?.url ?? file;
  delete payload.file;
  delete payload.file_token;
  delete payload.image_token;
  delete payload.image_url;
  return compactTaskPayload(payload);
};

export const assertSupportedUpload = (file: File) => {
  const allowedTypes = new Set([
    "",
    "application/octet-stream",
    "image/jpeg",
    "image/png",
    "image/webp",
    "model/gltf-binary",
    "model/gltf+json",
    "application/x-fbx",
    "application/sla",
    "text/plain",
  ]);
  const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".glb", ".gltf", ".fbx", ".obj", ".stl"]);
  const lowerName = file.name.toLowerCase();
  const extensionAllowed = [...allowedExtensions].some((extension) => lowerName.endsWith(extension));
  if (!allowedTypes.has(file.type) && !extensionAllowed) {
    throw new HttpError(415, "unsupported_file_type", "Supported uploads: JPEG, PNG, WEBP, GLB, GLTF, FBX, OBJ, STL");
  }
};

export const isUploadFile = (value: unknown): value is File => {
  if (!value || typeof value === "string") return false;
  const candidate = value as File;
  return typeof candidate.arrayBuffer === "function" && typeof candidate.size === "number" && typeof candidate.name === "string";
};

export const copyHeader = (from: Headers, to: Headers, name: string) => {
  const value = from.get(name);
  if (value) to.set(name, value);
};