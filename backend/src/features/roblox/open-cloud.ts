import { HttpError, parseIntegerEnv } from "../../core/http";
import type { RuntimeEnv } from "../../types";

const ROBLOX_ASSETS_BASE_URL = "https://apis.roblox.com/assets/v1";
const DEFAULT_MODEL_LIMIT_BYTES = 20 * 1024 * 1024;

export type RobloxCreator =
  | { userId: string }
  | { groupId: string };

export const robloxOpenCloudStatus = (env: RuntimeEnv) => {
  const creator = readRobloxCreator(env, false);
  return {
    api_key_configured: !!env.ROBLOX_OPEN_CLOUD_API_KEY?.trim(),
    creator,
    model_limit_bytes: parseIntegerEnv(env.ROBLOX_MAX_MODEL_BYTES, DEFAULT_MODEL_LIMIT_BYTES, 1),
  };
};

export const createRobloxModelAsset = async (
  env: RuntimeEnv,
  input: {
    file: File;
    displayName: string;
    description: string;
    dryRun?: boolean;
  },
) => {
  const creator = readRobloxCreator(env, true);
  const displayName = normalizeDisplayName(input.displayName || stripExtension(input.file.name) || "Bloxlab Model");
  const description = normalizeDescription(input.description || "Uploaded by Bloxlab Studio");
  const contentType = robloxModelContentType(input.file);
  const maxBytes = parseIntegerEnv(env.ROBLOX_MAX_MODEL_BYTES, DEFAULT_MODEL_LIMIT_BYTES, 1);

  if (input.file.size > maxBytes) {
    throw new HttpError(413, "roblox_model_too_large", `Roblox model upload must be <= ${maxBytes} bytes`);
  }

  const requestPayload = {
    assetType: "Model",
    displayName,
    description,
    creationContext: {
      creator,
    },
  };

  if (input.dryRun) {
    return {
      dry_run: true,
      endpoint: `${ROBLOX_ASSETS_BASE_URL}/assets`,
      request: requestPayload,
      file: {
        name: input.file.name,
        size: input.file.size,
        content_type: contentType,
      },
    };
  }

  const apiKey = env.ROBLOX_OPEN_CLOUD_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(
      503,
      "roblox_key_not_configured",
      "ROBLOX_OPEN_CLOUD_API_KEY is missing. Configure it as a Cloudflare secret.",
    );
  }

  const form = new FormData();
  form.append("request", JSON.stringify(requestPayload));
  form.append("fileContent", input.file, input.file.name || "model.glb");

  const response = await fetch(`${ROBLOX_ASSETS_BASE_URL}/assets`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: form,
  });

  const data = await readRobloxJson(response);
  if (!response.ok) {
    throw new HttpError(response.status, "roblox_asset_upload_failed", "Roblox asset upload failed", data);
  }

  return data;
};

export const getRobloxAssetOperation = async (env: RuntimeEnv, operationId: string) => {
  const apiKey = env.ROBLOX_OPEN_CLOUD_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(
      503,
      "roblox_key_not_configured",
      "ROBLOX_OPEN_CLOUD_API_KEY is missing. Configure it as a Cloudflare secret.",
    );
  }

  const normalized = operationId.replace(/^operations\//, "").trim();
  if (!normalized) {
    throw new HttpError(400, "missing_operation_id", "operationId is required");
  }

  const response = await fetch(`${ROBLOX_ASSETS_BASE_URL}/operations/${encodeURIComponent(normalized)}`, {
    headers: {
      "x-api-key": apiKey,
    },
  });
  const data = await readRobloxJson(response);
  if (!response.ok) {
    throw new HttpError(response.status, "roblox_operation_failed", "Could not read Roblox operation", data);
  }
  return data;
};

const readRobloxCreator = (env: RuntimeEnv, required: boolean): RobloxCreator | null => {
  const userId = env.ROBLOX_CREATOR_USER_ID?.trim();
  const groupId = env.ROBLOX_GROUP_ID?.trim();

  if (userId && groupId) {
    throw new HttpError(
      500,
      "roblox_creator_ambiguous",
      "Set either ROBLOX_CREATOR_USER_ID or ROBLOX_GROUP_ID, not both.",
    );
  }

  if (userId) {
    assertIntegerString(userId, "ROBLOX_CREATOR_USER_ID");
    return { userId };
  }

  if (groupId) {
    assertIntegerString(groupId, "ROBLOX_GROUP_ID");
    return { groupId };
  }

  if (required) {
    throw new HttpError(
      503,
      "roblox_creator_not_configured",
      "Set ROBLOX_CREATOR_USER_ID for personal uploads or ROBLOX_GROUP_ID for group uploads.",
    );
  }

  return null;
};

const robloxModelContentType = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".fbx")) return "model/fbx";
  if (lowerName.endsWith(".gltf")) return "model/gltf+json";
  if (lowerName.endsWith(".glb")) return "model/gltf-binary";
  if (lowerName.endsWith(".rbxm") || lowerName.endsWith(".rbxmx")) return "model/x-rbxm";

  throw new HttpError(
    415,
    "unsupported_roblox_model_type",
    "Roblox model uploads support .fbx, .gltf, .glb, .rbxm, and .rbxmx",
  );
};

const normalizeDisplayName = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Bloxlab Model";
  return trimmed.slice(0, 50);
};

const normalizeDescription = (value: string) => value.trim().slice(0, 1000);

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

const assertIntegerString = (value: string, name: string) => {
  if (!/^\d+$/.test(value)) {
    throw new HttpError(500, "invalid_roblox_creator_id", `${name} must contain only digits.`);
  }
};

const readRobloxJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
};
