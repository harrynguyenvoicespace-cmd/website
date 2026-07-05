import { z } from "zod";
import { HttpError, parseIntegerEnv } from "../../core/http";
import type { RuntimeEnv } from "../../types";

const SAFE_TOOLS = new Set([
  "snapshotExplorer",
  "inspectInstance",
  "searchExplorer",
  "listToolboxAssets",
  "insertToolboxAsset",
  "insertAsset",
  "createInstance",
  "setProperty",
  "transform",
  "rename",
  "createScript",
  "readScript",
  "patchScript",
  "readConsole",
]);

const CONFIRMATION_TOOLS = new Set([
  "deleteInstance",
  "massTransform",
  "terrainClear",
]);

const ALL_TOOLS = new Set([...SAFE_TOOLS, ...CONFIRMATION_TOOLS]);

const AgentToolCallSchema = z.object({
  id: z.string().min(1).max(96).optional(),
  tool: z.string().min(1).max(64),
  args: z.record(z.unknown()).optional().default({}),
});

const AgentModelResponseSchema = z.object({
  ok: z.boolean().optional(),
  message: z.string().max(2000).optional(),
  toolCalls: z.array(AgentToolCallSchema).optional().default([]),
  requiresConfirmation: z.boolean().optional().default(false),
});

export const AgentRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  sessionId: z.string().max(160).optional(),
  selectedId: z.string().max(160).optional().nullable(),
  context: z.record(z.unknown()).optional().default({}),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export type AgentResponse = {
  message: string;
  toolCalls: AgentToolCall[];
  requiresConfirmation: boolean;
  fallback?: boolean;
};

type Provider = "openai" | "gemini" | "anthropic";

export const createAiAgentResponse = async (
  env: RuntimeEnv,
  input: AgentRequest,
): Promise<AgentResponse> => {
  const blocked = blockedSecretPrompt(input.prompt);
  if (blocked) {
    return {
      message: "Please ask about editing the experience without requesting secrets or personal information.",
      toolCalls: [],
      requiresConfirmation: false,
    };
  }

  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) {
    return deterministicAgentPlan(input, "Backend AI key is not configured; using local tool planner.");
  }

  try {
    const rawText = await callProvider(env, input, apiKey);
    const parsed = parseAgentJson(rawText);
    return validateAgentResponse(env, parsed, input);
  } catch (error) {
    const fallback = deterministicAgentPlan(input, "Agent model response was not usable; using local tool planner.");
    if (fallback.toolCalls.length > 0) {
      return fallback;
    }

    return {
      message:
        error instanceof HttpError
          ? error.message
          : "Agent response invalid. Please rephrase the request or try again.",
      toolCalls: [],
      requiresConfirmation: false,
      fallback: true,
    };
  }
};

const callProvider = async (env: RuntimeEnv, input: AgentRequest, apiKey: string) => {
  const provider = normalizeProvider(env.AI_PROVIDER);
  if (provider === "gemini") {
    return callGemini(env, input, apiKey);
  }
  if (provider === "anthropic") {
    return callAnthropic(env, input, apiKey);
  }
  return callOpenAi(env, input, apiKey);
};

const normalizeProvider = (value?: string): Provider => {
  const normalized = (value ?? "openai").trim().toLowerCase();
  if (normalized === "gemini" || normalized === "anthropic" || normalized === "openai") {
    return normalized;
  }
  return "openai";
};

const callOpenAi = async (env: RuntimeEnv, input: AgentRequest, apiKey: string) => {
  const model = env.AI_MODEL?.trim() || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildAgentSystemPrompt(env) },
        { role: "user", content: buildAgentUserPrompt(input) },
      ],
    }),
  });

  const decoded = await decodeProviderResponse(response, "openai");
  return String(decoded.choices?.[0]?.message?.content ?? "");
};

const callGemini = async (env: RuntimeEnv, input: AgentRequest, apiKey: string) => {
  const model = env.AI_MODEL?.trim() || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${buildAgentSystemPrompt(env)}\n\n${buildAgentUserPrompt(input)}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const decoded = await decodeProviderResponse(response, "gemini");
  const parts = decoded.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part: { text?: unknown }) => String(part.text ?? "")).join("\n");
};

const callAnthropic = async (env: RuntimeEnv, input: AgentRequest, apiKey: string) => {
  const model = env.AI_MODEL?.trim() || "claude-3-5-sonnet-latest";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system: buildAgentSystemPrompt(env),
      messages: [{ role: "user", content: buildAgentUserPrompt(input) }],
    }),
  });

  const decoded = await decodeProviderResponse(response, "anthropic");
  const content = decoded.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part: { text?: unknown }) => String(part.text ?? "")).join("\n");
};

const decodeProviderResponse = async (response: Response, provider: string) => {
  const text = await response.text();
  let decoded: Record<string, any> = {};
  try {
    decoded = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(502, "ai_provider_invalid_json", `${provider} returned invalid JSON`);
  }

  if (!response.ok) {
    const message =
      decoded.error?.message ??
      decoded.message ??
      `${provider} HTTP ${response.status}`;
    throw new HttpError(response.status >= 400 ? 502 : 500, "ai_provider_error", String(message));
  }

  return decoded;
};

const buildAgentSystemPrompt = (env: RuntimeEnv) => {
  const maxSteps = parseIntegerEnv(env.AI_MAX_TOOL_STEPS, 6, 0);
  const maxContextNodes = parseIntegerEnv(env.AI_MAX_CONTEXT_NODES, 800, 100);
  return [
    "You are Bloxlab AI Agent inside a Roblox Studio-like editor.",
    "Return JSON only. No Markdown, no prose outside JSON.",
    "Never request, read, or reveal secrets, API keys, tokens, passwords, or unrelated script internals.",
    "Never output raw Lua for execution. Use toolCalls only.",
    "Prefer safe, minimal edits. Destructive edits require confirmation.",
    `Use at most ${maxSteps} tool calls.`,
    `Context is compacted to about ${maxContextNodes} Explorer nodes. If more is needed, call searchExplorer or inspectInstance.`,
    "Allowed tools: snapshotExplorer, inspectInstance, searchExplorer, listToolboxAssets, insertToolboxAsset, insertAsset, createInstance, setProperty, transform, rename, createScript, readScript, patchScript, readConsole.",
    "Confirmation tools: deleteInstance, massTransform, terrainClear. Set requiresConfirmation true when using them.",
    "Special ids supported by the executor: $selected, $workspace, $serverScriptService, $starterGui, $last, $lastPart.",
    "For Toolbox assets, use insertToolboxAsset with toolboxAssetId from the provided toolbox catalog.",
    "For scripts, create Script/LocalScript/ModuleScript only. Prefer server Script under the relevant Part for ClickDetector behavior.",
    'Response shape: {"message":"short user-facing summary","toolCalls":[{"id":"call_1","tool":"toolName","args":{}}],"requiresConfirmation":false}',
  ].join("\n");
};

const buildAgentUserPrompt = (input: AgentRequest) =>
  JSON.stringify({
    prompt: input.prompt,
    sessionId: input.sessionId,
    selectedId: input.selectedId,
    context: compactContext(input.context),
  });

const compactContext = (context: Record<string, unknown>) => {
  const raw = JSON.stringify(context ?? {});
  if (raw.length <= 80_000) {
    return context;
  }
  return {
    note: "Context was too large and was truncated by the backend before model call.",
    excerpt: raw.slice(0, 80_000),
  };
};

const parseAgentJson = (text: string) => {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
  }

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    throw new HttpError(502, "agent_response_invalid", "Agent response invalid: expected JSON object");
  }
};

const validateAgentResponse = (
  env: RuntimeEnv,
  raw: unknown,
  input: AgentRequest,
): AgentResponse => {
  const parsed = AgentModelResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(502, "agent_response_invalid", "Agent response invalid: schema mismatch");
  }

  const maxSteps = parseIntegerEnv(env.AI_MAX_TOOL_STEPS, 6, 0);
  const toolCalls: AgentToolCall[] = [];
  let requiresConfirmation = parsed.data.requiresConfirmation;

  for (const [index, call] of parsed.data.toolCalls.entries()) {
    if (toolCalls.length >= maxSteps) {
      break;
    }
    if (!ALL_TOOLS.has(call.tool)) {
      throw new HttpError(502, "agent_tool_not_allowed", `Agent requested unsupported tool: ${call.tool}`);
    }
    if (CONFIRMATION_TOOLS.has(call.tool)) {
      requiresConfirmation = true;
    }
    toolCalls.push({
      id: call.id ?? `call_${index + 1}`,
      tool: call.tool,
      args: call.args ?? {},
    });
  }

  return {
    message: parsed.data.message?.trim() || defaultMessageForToolCalls(toolCalls, input),
    toolCalls,
    requiresConfirmation,
  };
};

const deterministicAgentPlan = (input: AgentRequest, note: string): AgentResponse => {
  const prompt = input.prompt.toLowerCase();
  const selectedId = input.selectedId || "$selected";

  if (blockedSecretPrompt(input.prompt)) {
    return {
      message: "Please ask about editing the experience without requesting secrets or personal information.",
      toolCalls: [],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  if (prompt.includes("right triangle") || prompt.includes("right-triangle") || prompt.includes("tam giÃ¡c vuÃ´ng")) {
    return {
      message: "Inserted Right Triangle into Workspace.",
      toolCalls: [
        {
          id: "call_1",
          tool: "insertToolboxAsset",
          args: { toolboxAssetId: "right-triangle", position: [0, 5, 0] },
        },
      ],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  if (prompt.includes("toolbox") || prompt.includes("creator store")) {
    return {
      message: "Reading the Toolbox catalog.",
      toolCalls: [{ id: "call_1", tool: "listToolboxAssets", args: {} }],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  const renameTo = parseRenameTarget(input.prompt);
  if (renameTo) {
    return {
      message: `Renamed selected object to ${renameTo}.`,
      toolCalls: [{ id: "call_1", tool: "rename", args: { id: selectedId, name: renameTo } }],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  const moveDelta = parseMoveDelta(input.prompt);
  if (moveDelta) {
    return {
      message: "Moved the selected object.",
      toolCalls: [{ id: "call_1", tool: "transform", args: { id: selectedId, delta: moveDelta } }],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  if (prompt.includes("click") && prompt.includes("color") && (prompt.includes("part") || prompt.includes("brick"))) {
    return {
      message: "Created a clickable Part that changes color.",
      toolCalls: [
        {
          id: "call_1",
          tool: "createInstance",
          args: {
            className: "Part",
            name: "Click Color Part",
            parentId: "$workspace",
            position: [0, 5, 0],
            size: [4, 1, 4],
            anchored: true,
          },
        },
        {
          id: "call_2",
          tool: "createInstance",
          args: { className: "ClickDetector", name: "ClickDetector", parentId: "$lastPart" },
        },
        {
          id: "call_3",
          tool: "createScript",
          args: {
            parentId: "$lastPart",
            scriptType: "Script",
            name: "ClickColorScript",
            source: [
              "local part = script.Parent",
              "local clickDetector = part:FindFirstChildOfClass(\"ClickDetector\")",
              "if not clickDetector then",
              "\tclickDetector = Instance.new(\"ClickDetector\")",
              "\tclickDetector.Parent = part",
              "end",
              "",
              "local colors = {",
              "\tColor3.fromRGB(255, 80, 80),",
              "\tColor3.fromRGB(80, 180, 255),",
              "\tColor3.fromRGB(80, 255, 140),",
              "\tColor3.fromRGB(255, 220, 80),",
              "}",
              "local index = 0",
              "",
              "clickDetector.MouseClick:Connect(function()",
              "\tindex = (index % #colors) + 1",
              "\tpart.Color = colors[index]",
              "end)",
            ].join("\n"),
          },
        },
        { id: "call_4", tool: "readConsole", args: {} },
      ],
      requiresConfirmation: false,
      fallback: true,
    };
  }

  return {
    message: `${note} I can inspect, insert Toolbox assets, rename, move, set properties, and create guarded scripts. Please make the edit request more specific.`,
    toolCalls: [],
    requiresConfirmation: false,
    fallback: true,
  };
};

const defaultMessageForToolCalls = (toolCalls: AgentToolCall[], input: AgentRequest) => {
  if (toolCalls.length === 0) {
    return `Ready to help with: ${input.prompt}`;
  }
  return `Planned ${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"}.`;
};

const parseRenameTarget = (prompt: string) => {
  const patterns = [
    /\brename\b.+?\bto\s+["']?([^"']+)["']?$/i,
    /\bÄ‘á»•i\s+tÃªn\b.+?\b(thÃ nh|sang)\s+["']?([^"']+)["']?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = match?.[2] ?? match?.[1];
    const cleaned = value?.trim().replace(/[.?!ã€‚]+$/, "");
    if (cleaned) {
      return cleaned.slice(0, 100);
    }
  }
  return undefined;
};

const parseMoveDelta = (prompt: string) => {
  const lower = prompt.toLowerCase();
  const amount = Number.parseFloat(lower.match(/(-?\d+(?:\.\d+)?)/)?.[1] ?? "5");
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  if (lower.includes("move") || lower.includes("dá»‹ch") || lower.includes("di chuyá»ƒn")) {
    if (lower.includes("up") || lower.includes("lÃªn")) return [0, Math.abs(amount), 0];
    if (lower.includes("down") || lower.includes("xuá»‘ng")) return [0, -Math.abs(amount), 0];
    if (lower.includes("left") || lower.includes("trÃ¡i")) return [-Math.abs(amount), 0, 0];
    if (lower.includes("right") || lower.includes("pháº£i")) return [Math.abs(amount), 0, 0];
    if (lower.includes("forward") || lower.includes("trÆ°á»›c")) return [0, 0, -Math.abs(amount)];
    if (lower.includes("back") || lower.includes("sau")) return [0, 0, Math.abs(amount)];
  }
  return undefined;
};

const blockedSecretPrompt = (prompt: string) => {
  const lowerPrompt = prompt.toLowerCase();
  const sensitiveTerms = ["api key", "secret", "password", "token", "personal information", "home address"];
  const leakVerbs = ["show", "print", "reveal", "expose", "send", "give me", "tell me", "read", "get", "dump", "log", "display"];
  return sensitiveTerms.some((term) => lowerPrompt.includes(term)) &&
    leakVerbs.some((verb) => lowerPrompt.includes(verb));
};
