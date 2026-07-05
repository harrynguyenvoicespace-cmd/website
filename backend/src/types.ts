export type SecretEnv = {
  TRIPO_API_KEY?: string;
  ROBLOX_OPEN_CLOUD_API_KEY?: string;
  ROBLOX_CREATOR_USER_ID?: string;
  ROBLOX_GROUP_ID?: string;
  ROBLOX_MAX_MODEL_BYTES?: string;
  HYMOTION_BASE_URL?: string;
  MODAL_HYMOTION_BASE_URL?: string;
  HYMOTION_API_KEY?: string;
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_MAX_TOOL_STEPS?: string;
  AI_MAX_CONTEXT_NODES?: string;
  CLIENT_API_KEYS?: string;
  ADMIN_API_KEYS?: string;
};

export type RuntimeEnv = Env & SecretEnv;

export type AppVariables = {
  requestId: string;
  clientId: string;
  isAdmin: boolean;
};

export type AppBindings = {
  Bindings: RuntimeEnv;
  Variables: AppVariables;
};

export type TripoResponse<T = unknown> = {
  code?: number;
  message?: string;
  suggestion?: string;
  data?: T;
};

export type TripoTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "banned"
  | "expired"
  | "cancelled"
  | "unknown";

export type TripoTask = {
  task_id: string;
  type: string;
  status: TripoTaskStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  progress?: number;
  consumed_credit?: number;
  queuing_num?: number;
  running_left_time?: number;
  create_time?: number;
  error_code?: number;
  error_msg?: string;
};