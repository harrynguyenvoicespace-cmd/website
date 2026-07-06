const config = window.BLOXLAB_CONFIG || { sessionKey: "bloxlab.session" };
const session = localStorage.getItem(config.sessionKey || "bloxlab.session");
const data = window.TRIPO_PANEL_DATA;
const { ops, groupMeta, quickOpIds, views, skyboxFaces, skyboxFaceLabel, modelExt, imageExt, fileExt, defaultApiRoot } = data;
const topologyFieldNames = new Set(data.topologyFieldNames);
const canvas = document.getElementById("studioCanvas");
const fpsEl = document.querySelector("[data-fps]");
const countEl = document.querySelector("[data-object-count]");
const currentModeEl = document.querySelector("[data-current-mode]");
const resetButton = document.querySelector("[data-reset-camera]");
const addBlockButton = document.querySelector("[data-add-block]");
const inspectorButtons = document.querySelectorAll("[data-toggle-inspector]");
const sourceBody = document.querySelector("[data-source-body]");
const topologyFieldsEl = document.querySelector("[data-topology-fields]");
const advancedFieldsEl = document.querySelector("[data-advanced-fields]");
const operationSelect = document.querySelector("[data-operation-select]");
const apiRootInput = document.querySelector("[data-api-root]");
const clientKeyInput = document.querySelector("[data-client-key]");
const adminKeyInput = document.querySelector("[data-admin-key]");
const modeButtons = document.querySelectorAll("[data-mode]");
const sourceButtons = document.querySelectorAll("[data-source-tab]");
const railButtons = document.querySelectorAll("[data-rail-tool]");
const privacyButton = document.querySelector("[data-privacy]");
const privacyLabel = document.querySelector("[data-privacy-label]");
const generateButton = document.querySelector("[data-generate-model]");
const operationIcon = document.querySelector("[data-operation-icon]");
const runIcon = document.querySelector("[data-run-icon]");
const progressLabel = document.querySelector("[data-progress-label]");
const progressValue = document.querySelector("[data-progress-value]");
const progressBar = document.querySelector("[data-progress-bar]");
const errorBox = document.querySelector("[data-error]");
const reportBlock = document.querySelector("[data-report-block]");
const reportStatus = document.querySelector("[data-report-status]");
const reportList = document.querySelector("[data-report-list]");
const historyBlock = document.querySelector("[data-history-block]");
const historyList = document.querySelector("[data-history-list]");
const linksBlock = document.querySelector("[data-links-block]");
const linksCount = document.querySelector("[data-links-count]");
const linkList = document.querySelector("[data-link-list]");
const rawBlock = document.querySelector("[data-raw-block]");
const rawResponse = document.querySelector("[data-raw-response]");
if (!session) window.location.href = "./login.html";
if (!window.BABYLON) { document.body.innerHTML = "<main class='studio-shell'><section class='viewport-panel'><header class='viewport-header'><h1>BabylonJS failed to load</h1></header></section></main>"; throw new Error("BabylonJS CDN did not load."); }
let group = "generate";
let opId = "image-to-model";
let op = findOp(opId);
let form = defaults(op);
let upload = null;
let viewUrls = { front: "", left: "", back: "", right: "" };
let viewFiles = { front: null, left: null, back: null, right: null };
let busy = false;
let autoImport = true;
let privacy = "Public";
let history = [];
let links = [];
let raw = null;
let report = null;
let apiRoot = stored("freed.api.root", defaultApiRoot).replace(/\/$/, "");
let clientKey = stored("freed.api.clientKey", "local-dev-key");
let adminKey = stored("freed.api.adminKey", "local-admin-key");
let objectCount = 3;
let textureIndex = 0;
let inspectorOpen = false;
function stored(key, fallback) { return localStorage.getItem(key) || fallback; }
function findOp(id) { return ops.find((item) => item.id === id) || ops[0]; }
function defaults(item) { const next = {}; item.fields.forEach((field) => { next[field.name] = field.def !== undefined ? field.def : field.kind === "boolean" ? false : ""; }); return next; }
function activeFields() { return op.fields.filter((field) => !field.show || field.show(form)); }
function topologyFields() { return activeFields().filter((field) => topologyFieldNames.has(field.name)); }
function primaryTextFields() { return activeFields().filter((field) => ["prompt", "input"].includes(field.name)); }
function advancedFields() { return activeFields().filter((field) => !topologyFieldNames.has(field.name) && !["prompt", "input"].includes(field.name)); }
function activeOps() { return ops.filter((item) => item.group === group); }
function lineList(value) { return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function compact(input) { const out = {}; Object.entries(input).forEach(([key, value]) => { if (value === undefined || value === "") return; if (Array.isArray(value) && !value.length) return; out[key] = value; }); return out; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }
function icon(name) { return `<i data-lucide="${escapeAttr(name)}" aria-hidden="true"></i>`; }
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function setProgress(label, value) { const safe = Math.max(0, Math.min(100, Number(value) || 0)); progressLabel.textContent = label; progressValue.textContent = `${safe}%`; progressBar.style.width = `${safe}%`; }
function setInspectorButtonState(open) { inspectorButtons.forEach((button) => { button.classList.toggle("is-active", open); const label = button.querySelector("span"); if (label) label.textContent = open ? "Hide Inspector" : "Inspector"; else button.textContent = open ? "Hide Inspector" : "Inspector"; button.setAttribute("aria-label", open ? "Close Babylon Inspector" : "Open Babylon Inspector"); }); refreshIcons(); }
async function toggleInspector() { if (!studio?.scene?.debugLayer) { showError("Babylon Inspector bundle did not load."); return; } if (inspectorOpen) { studio.scene.debugLayer.hide(); inspectorOpen = false; setInspectorButtonState(false); setProgress("Inspector closed", 5); return; } await studio.scene.debugLayer.show({ embedMode: true, overlay: false, handleResize: true, enablePopup: false }); inspectorOpen = true; setInspectorButtonState(true); setProgress("Inspector reading scene", 100); }
function showError(message) { errorBox.hidden = !message; errorBox.textContent = message || ""; }
function setBusy(value) { busy = value; generateButton.disabled = busy; runIcon.setAttribute("data-lucide", busy ? "loader-2" : "sparkles"); runIcon.classList.toggle("animate-spin", busy); renderControlsDisabled(); refreshIcons(); }
function renderControlsDisabled() { document.querySelectorAll(".shell button, .shell input, .shell select, .shell textarea").forEach((node) => { if (node.matches("[data-api-root], [data-client-key], [data-admin-key]")) return; node.disabled = busy; }); }
function switchOp(next) { op = next; opId = next.id; group = next.group; form = defaults(next); upload = null; viewUrls = { front: "", left: "", back: "", right: "" }; viewFiles = { front: null, left: null, back: null, right: null }; report = null; showError(""); setProgress("Ready", 0); renderAll(); }
function switchGroup(nextGroup) { switchOp(ops.find((item) => item.group === nextGroup) || op); }
function setField(name, value, shouldRender = false) { form = { ...form, [name]: value }; if (shouldRender) renderAll(); }
function wideField(field) { return field.kind === "boolean" || field.kind === "textarea" || field.kind === "multiline" || ["prompt", "negative_prompt", "description", "rulesJson"].includes(field.name); }
function renderField(field) {
  const value = form[field.name];
  const wide = wideField(field) ? " fieldWide" : "";
  if (field.kind === "boolean") return `<div class="toggleRow${wide}"><span>${escapeHtml(field.label)}</span><button type="button" class="switch ${value ? "switchOn" : ""}" data-toggle-field="${escapeAttr(field.name)}" aria-pressed="${Boolean(value)}"><span></span><b>${value ? "On" : "Off"}</b></button></div>`;
  if (field.kind === "textarea" || field.kind === "multiline") return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><textarea class="textarea" data-field="${escapeAttr(field.name)}" placeholder="${escapeAttr(field.placeholder || "")}">${escapeHtml(value ?? "")}</textarea></label>`;
  if (field.kind === "select") { const opts = (field.options || []).map((item) => `<option value="${escapeAttr(item.value)}" ${String(value ?? "") === String(item.value) ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join(""); return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><select class="control" data-field="${escapeAttr(field.name)}">${opts}</select></label>`; }
  const attrs = [`class="control"`, `type="${field.kind === "number" ? "number" : "text"}"`, `data-field="${escapeAttr(field.name)}"`, `value="${escapeAttr(value ?? "")}"`];
  if (field.min !== undefined) attrs.push(`min="${escapeAttr(field.min)}"`);
  if (field.max !== undefined) attrs.push(`max="${escapeAttr(field.max)}"`);
  if (field.step !== undefined) attrs.push(`step="${escapeAttr(field.step)}"`);
  if (field.placeholder) attrs.push(`placeholder="${escapeAttr(field.placeholder)}"`);
  return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><input ${attrs.join(" ")} /></label>`;
}
function connectRenderedFields(root = document) {
  root.querySelectorAll("[data-field]").forEach((control) => {
    const handler = () => setField(control.dataset.field, control.value, ["model", "texture", "animation_mode"].includes(control.dataset.field));
    control.addEventListener("input", handler);
    control.addEventListener("change", handler);
  });
  root.querySelectorAll("[data-toggle-field]").forEach((control) => control.addEventListener("click", () => setField(control.dataset.toggleField, !Boolean(form[control.dataset.toggleField]), true)));
}
function renderRail() { railButtons.forEach((button) => { const active = button.dataset.railTool === group; button.classList.toggle("railButtonActive", active); button.disabled = busy; }); }
function renderModes() { modeButtons.forEach((button) => { const active = button.dataset.mode === (autoImport ? "smart" : "hd"); button.classList.toggle("modeActive", active); button.disabled = busy; }); currentModeEl.textContent = autoImport ? "Smart" : "HD"; }
function renderSourceTabs() { sourceButtons.forEach((button) => { const active = button.dataset.sourceTab === opId; button.classList.toggle("sourceTabActive", active); button.setAttribute("aria-pressed", String(active)); button.disabled = busy; }); }
function renderSourceBody() {
  if (op.upload && !["none", "multiview"].includes(op.upload)) {
    const accept = op.upload === "image" ? "image/png,image/jpeg,image/webp" : ".glb,.gltf,.fbx,.obj,.stl,.rbxm,.rbxmx";
    sourceBody.innerHTML = `<div class="uploadStage"><label class="uploadDropzone"><input class="fileInput" type="file" accept="${accept}" data-upload-file /><span class="uploadGlyph">${icon("image")}</span><strong data-upload-name>${escapeHtml(upload ? upload.name : "Upload")}</strong><small>JPG, PNG, WEBP Size &lt;= 20MB</small></label><button type="button" class="generateImageLink" data-generate-image>Generate Image for 3D ${icon("chevron-right")}</button></div>`;
    const input = sourceBody.querySelector("[data-upload-file]");
    input.addEventListener("change", () => { upload = input.files?.[0] || null; sourceBody.querySelector("[data-upload-name]").textContent = upload ? upload.name : "Upload"; if (upload) previewUploadedFile(upload); });
    sourceBody.querySelector("[data-generate-image]").addEventListener("click", () => switchOp(findOp("text-to-image")));
  } else if (op.upload === "multiview") {
    sourceBody.innerHTML = `<div class="viewGrid">${views.map((key) => `<div class="viewCell"><label class="field"><span>${key} URL</span><input class="control" data-view-url="${key}" value="${escapeAttr(viewUrls[key])}" /></label><input class="fileInputMini" type="file" accept="image/png,image/jpeg,image/webp" data-view-file="${key}" /></div>`).join("")}</div>`;
    sourceBody.querySelectorAll("[data-view-url]").forEach((input) => input.addEventListener("input", () => { viewUrls[input.dataset.viewUrl] = input.value; }));
    sourceBody.querySelectorAll("[data-view-file]").forEach((input) => input.addEventListener("change", () => { viewFiles[input.dataset.viewFile] = input.files?.[0] || null; }));
  } else {
    sourceBody.innerHTML = `<div class="primaryPrompt">${primaryTextFields().map(renderField).join("")}</div>`;
    connectRenderedFields(sourceBody);
  }
}
function renderGeneral() { topologyFieldsEl.innerHTML = topologyFields().map(renderField).join(""); connectRenderedFields(topologyFieldsEl); privacyLabel.textContent = privacy; }
function renderAdvanced() { operationSelect.innerHTML = activeOps().map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === opId ? "selected" : ""}>${escapeHtml(item.label)} - ${escapeHtml(item.desc)}</option>`).join(""); advancedFieldsEl.innerHTML = advancedFields().map(renderField).join(""); connectRenderedFields(advancedFieldsEl); apiRootInput.value = apiRoot; clientKeyInput.value = clientKey; adminKeyInput.value = adminKey; }
function renderOutputs() {
  reportBlock.hidden = !report;
  if (report) { reportStatus.textContent = report.status || "ready"; reportList.innerHTML = (report.issues || []).slice(0, 8).map((issue) => `<div class="issueRow">${escapeHtml(issue.label || issue.code)}: ${escapeHtml(issue.message || "")}</div>`).join(""); }
  historyBlock.hidden = history.length === 0;
  historyList.innerHTML = history.map((item) => `<button type="button" class="historyItem" data-history-id="${escapeAttr(item.id)}"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.id)}</b></button>`).join("");
  linksBlock.hidden = links.length === 0;
  const importable = links.filter(canImportLink);
  linksCount.textContent = importable.length ? `${importable.length} importable` : `${links.length} files`;
  linkList.innerHTML = links.map((link, index) => `<div class="linkCard"><div class="linkTop"><strong>${escapeHtml(link.label)}</strong><span>${escapeHtml(link.kind)}</span></div><p>${escapeHtml(link.url)}</p><div class="linkActions"><button type="button" data-link-action="download" data-link-index="${index}">${icon("download")} Download</button>${canImportLink(link) ? `<button type="button" class="primarySmall" data-link-action="view" data-link-index="${index}">${icon("box")} View 3D</button>` : ""}${link.kind === "model" ? `<button type="button" data-link-action="cloud" data-link-index="${index}">${icon("upload")} OpenCloud</button>` : ""}</div></div>`).join("");
  rawBlock.hidden = !raw;
  rawResponse.textContent = raw ? JSON.stringify(raw, null, 2) : "";
  refreshIcons();
}
function renderAll() { operationIcon.setAttribute("data-lucide", op.icon); renderRail(); renderModes(); renderSourceTabs(); renderSourceBody(); renderGeneral(); renderAdvanced(); renderOutputs(); renderControlsDisabled(); refreshIcons(); }function taskId(payload) { return String(payload?.task_id || payload?.data?.task_id || payload?.data?.id || payload?.output?.id || ""); }
function taskStatus(payload) { return String(payload?.data?.status || payload?.status || "unknown").toLowerCase(); }
function extOf(url) { const clean = String(url || "").split("?")[0].toLowerCase(); return [...fileExt, ...imageExt].find((ext) => clean.endsWith(ext)) || ""; }
function modelishKey(key) { return /(^|[_-])(model|mesh|gltf|glb|fbx|obj|stl|usdz|3mf)([_-]|$)|model_url|pbr_model|base_model/i.test(key); }
function imageishKey(key) { return /image|render|thumbnail|preview|screenshot|front|left|right|back/i.test(key); }
function linkKind(key, url) { const clean = String(url || "").split("?")[0].toLowerCase(); if (imageExt.some((x) => clean.endsWith(x)) || imageishKey(key)) return "image"; if (modelExt.some((x) => clean.endsWith(x)) || modelishKey(key)) return "model"; return "file"; }
function canImportLink(link) { const ext = extOf(link.url).toLowerCase(); if (ext) return ext === ".glb" || ext === ".gltf"; return link.kind === "model" && /gltf|glb|model|mesh|output/i.test(link.key); }
function labelUrl(key, url) { const ext = extOf(url).replace(".", "").toUpperCase(); if (["BVH", "RBXM", "RBXMX"].includes(ext) || /hymotion|animation/i.test(key)) return `${ext || "Animation"} Animation`; const kind = linkKind(key, url); if (kind === "model") return `${ext || "3D"} Model`; if (kind === "image") return `${ext || "Image"} Image`; return key.replace(/[_-]/g, " ") || "Output"; }
function linksFrom(payload) {
  const found = [];
  const seen = new Set();
  const seenObj = new Set();
  const add = (key, url) => { if (!/^https?:\/\//i.test(url) || seen.has(url)) return; const ext = extOf(url); if (!ext && !/url|output|download|model|mesh|gltf|glb|image|render|animation|file/i.test(key)) return; seen.add(url); found.push({ label: labelUrl(key, url), url, key, kind: linkKind(key, url) }); };
  const forceModelOutputs = (value) => { const outputs = [value?.data?.output, value?.output, value?.tripo?.data?.output, value?.tripo?.output].filter(Boolean); for (const output of outputs) for (const key of ["model_url", "pbr_model_url", "base_model_url", "raw_model_url", "glb_url", "gltf_url"]) if (typeof output?.[key] === "string") add(key, output[key]); };
  const walk = (value, key = "output") => { if (!value || seenObj.has(value)) return; if (typeof value === "string") { add(key, value); return; } if (typeof value !== "object") return; seenObj.add(value); if (Array.isArray(value)) value.forEach((item) => walk(item, key)); else Object.entries(value).forEach(([childKey, child]) => walk(child, childKey)); };
  forceModelOutputs(payload);
  walk(payload);
  return found.sort((a, b) => { const rank = (link) => canImportLink(link) ? 0 : link.kind === "model" ? 1 : link.kind === "file" ? 2 : 3; return rank(a) - rank(b); });
}
function storableModelLinks(items) { return items.filter((link) => link.kind === "model" || /\.(glb|gltf|fbx|obj|stl|3mf|usdz)(\?|$)/i.test(link.url)); }
function filename(link) { try { return new URL(link.url).pathname.split("/").pop() || `output${extOf(link.url) || ".bin"}`; } catch { return `output${extOf(link.url) || ".bin"}`; } }
function compactStringify(value, max = 900) { try { const text = typeof value === "string" ? value : JSON.stringify(value); return text.length > max ? `${text.slice(0, max)}...` : text; } catch { return String(value).slice(0, max); } }
function payloadMessage(payload, fallback = "Unknown API error") { return String(payload?.error?.message || payload?.message || payload?.data?.error_msg || payload?.data?.error_message || payload?.data?.message || payload?.tripo?.message || payload?.tripo?.data?.error_msg || payload?.raw || fallback); }
function detailedMessage(title, payload) { const status = taskStatus(payload); const task = taskId(payload); const base = payloadMessage(payload, title); const details = compactStringify(payload?.error?.details || payload?.details || payload?.data || payload, 700); const meta = [task ? `task ${task}` : "", status && status !== "unknown" ? `status ${status}` : ""].filter(Boolean).join(", "); return `${title}${meta ? ` (${meta})` : ""}: ${base}${details && details !== base ? ` | ${details}` : ""}`; }
function makeHeaders(json = true, admin = true) { const headers = new Headers(); headers.set("x-api-key", clientKey.trim()); if (adminKey.trim() && admin) headers.set("x-admin-key", adminKey.trim()); if (json) headers.set("content-type", "application/json"); return headers; }
async function readResponse(response) { const text = await response.text(); let payload = {}; try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; } if (!response.ok || payload.ok === false) throw new Error(detailedMessage(`HTTP ${response.status} ${response.statusText || "API error"}`, payload)); return payload; }
async function api(path, init = {}, admin = true) { const headers = makeHeaders(!(init.body instanceof FormData), admin); new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value)); return readResponse(await fetch(`${apiRoot}${path}`, { ...init, headers })); }
async function uploadTripo(file) { setProgress("Uploading file", 10); const data = new FormData(); data.append("file", file, file.name); const payload = await api("/tripo/upload", { method: "POST", body: data }, false); const token = payload?.image_token || payload?.file_token || payload?.data?.image_token || payload?.data?.file_token; if (!token) throw new Error("Upload did not return file token."); return String(token); }
async function buildPayload() {
  const payload = {};
  activeFields().forEach((field) => { if (["inputs_text", "part_names_text", "animations_text"].includes(field.name)) return; const value = form[field.name]; if (field.kind === "number") { if (value !== "" && value !== undefined) payload[field.name] = Number(value); return; } if (field.kind === "boolean") { payload[field.name] = Boolean(value); return; } if (value !== "" && value !== undefined) payload[field.name] = value; });
  if (form.inputs_text) payload.inputs = lineList(form.inputs_text);
  if (form.part_names_text) payload.part_names = lineList(form.part_names_text);
  if (form.animation_mode === "multiple") { payload.animations = lineList(form.animations_text); delete payload.animation; }
  if (op.upload === "multiview") { const inputs = {}; for (const key of views) { if (viewFiles[key]) inputs[key] = await uploadTripo(viewFiles[key]); else if (viewUrls[key].trim()) inputs[key] = viewUrls[key].trim(); } if (Object.keys(inputs).length) payload.inputs = inputs; }
  else if (upload && op.upload && op.upload !== "none") { const token = await uploadTripo(upload); if (op.id === "image-to-model") { delete payload.input; payload.image_token = token; } else payload.input = token; }
  return compact(payload);
}
async function poll(id) { const done = ["success", "succeeded", "complete", "completed"]; const failed = ["failed", "cancelled", "canceled", "banned", "expired"]; for (let i = 0; i < 180; i += 1) { const payload = await api(`/tripo/tasks/${encodeURIComponent(id)}`, { method: "GET" }, false); const nextLinks = linksFrom(payload); raw = payload; links = nextLinks; renderOutputs(); const status = taskStatus(payload); const value = done.includes(status) ? 96 : Math.min(95, 12 + Math.floor(i * 0.7)); setProgress(`Tripo ${status}${nextLinks.length && !done.includes(status) ? " - waiting final output" : ""}`, value); if (failed.includes(status)) throw new Error(JSON.stringify(payload?.data || payload).slice(0, 500)); if (done.includes(status)) return payload; await new Promise((resolve) => setTimeout(resolve, 2000)); } throw new Error("Task polling timed out."); }
function skyboxPrompt(basePrompt, face) { return [basePrompt, `Roblox-style seamless cube-map skybox ${skyboxFaceLabel[face]} face.`, "Square 1:1 environment texture, 90 degree field of view, continuous horizon, soft lighting, no UI, no text, no character, no foreground object.", "Make this face align naturally with the other cube faces."].join(" "); }
function firstImageLink(payload) { return linksFrom(payload).find((link) => link.kind === "image" || imageExt.some((ext) => link.url.split("?")[0].toLowerCase().endsWith(ext))); }
async function createSkybox() { const basePrompt = String(form.prompt || "").trim(); if (!basePrompt) throw new Error("Skybox prompt is required."); const submissions = []; setProgress("Submitting 6 skybox faces", 5); for (const [index, face] of skyboxFaces.entries()) { setProgress(`Submitting skybox ${skyboxFaceLabel[face]} ${index + 1}/6`, 5 + index * 2); const payload = await api("/tripo/generation/text-to-image", { method: "POST", body: JSON.stringify(compact({ prompt: skyboxPrompt(basePrompt, face), model: String(form.model || "seedream_v5"), template: String(form.template || "") })) }, false); raw = payload; const id = taskId(payload); if (id) history = [{ id, label: `Skybox ${skyboxFaceLabel[face]}`, status: "submitted" }, ...history].slice(0, 8); submissions.push({ face, id, payload }); renderOutputs(); await new Promise((resolve) => setTimeout(resolve, 450)); } const faceLinks = []; for (const [index, item] of submissions.entries()) { const payload = item.id ? await poll(item.id) : item.payload; const image = firstImageLink(payload); if (image) faceLinks.push({ ...image, label: `Skybox ${skyboxFaceLabel[item.face]}`, key: `skybox_${item.face}`, face: item.face }); setProgress(`Skybox face ready ${index + 1}/6`, Math.min(96, 10 + (index + 1) * 14)); } links = faceLinks.map(({ face, ...link }) => link); raw = { status: "success", skybox_faces: faceLinks.reduce((acc, link) => ({ ...acc, [link.face]: link.url }), {}) }; studio.scene.clearColor = new BABYLON.Color4(0.08, 0.1, 0.16, 1); setProgress("Skybox in viewport", 100); renderOutputs(); return raw; }
function downloadUrl(link) { if (link.url.includes("/hymotion/animations/") || link.url.startsWith(apiRoot)) return link.url; return `${apiRoot}/tripo/download?url=${encodeURIComponent(link.url)}`; }
async function saveLink(link) { const anchor = document.createElement("a"); anchor.href = downloadUrl(link); anchor.download = filename(link); document.body.appendChild(anchor); anchor.click(); anchor.remove(); setProgress("Downloaded", 100); }
async function uploadGeneratedToRoblox(modelUrl) { const outputUrl = String(modelUrl || form.modelUrl || links.find((link) => link.kind === "model" || /\.(glb|gltf|fbx|rbxm|rbxmx)(\?|$)/i.test(link.url))?.url || "").trim(); if (!outputUrl) throw new Error("No Tripo model URL. Generate a model first or paste a model URL."); setProgress("Downloading Tripo output", 25); const virtualLink = { label: "Tripo Output", url: outputUrl, kind: "model", key: "opencloud" }; const response = await fetch(downloadUrl(virtualLink), { headers: { "x-api-key": clientKey.trim() } }); if (!response.ok) throw new Error(`Download failed HTTP ${response.status}`); const blob = await response.blob(); let fileName = filename(virtualLink).replace(/[^\w .-]+/g, " ").trim() || "tripo-output.glb"; if (!/\.(glb|gltf|fbx|rbxm|rbxmx)$/i.test(fileName)) fileName += ".glb"; const data = new FormData(); data.append("displayName", String(form.displayName || fileName.replace(/\.[^.]+$/, "") || "Tripo Generated Model")); data.append("description", String(form.description || "Uploaded from Tripo output in Freed.")); data.append("dryRun", String(Boolean(form.dryRun))); data.append("file", new File([blob], fileName, { type: blob.type || "model/gltf-binary" })); setProgress("Uploading to Roblox Open Cloud", 65); return api("/roblox/assets/models", { method: "POST", body: data }, true); }
async function importLink(link) { if (!canImportLink(link)) throw new Error("Freed view supports GLB/GLTF only. Convert to GLTF first."); setProgress("Loading model into view", 98); if (!BABYLON.SceneLoader) throw new Error("BabylonJS loader did not load."); const result = await BABYLON.SceneLoader.ImportMeshAsync("", link.url, "", studio.scene); const imported = result.meshes.filter((mesh) => mesh.name !== "__root__"); imported.forEach((mesh, index) => { mesh.position.x += (index % 3) - 1; mesh.position.y += 0.5; }); objectCount += Math.max(1, imported.length); refreshObjectCount(); setProgress(`Model in view (${imported.length} meshes)`, 100); return result; }
async function run() {
  setBusy(true); showError(""); report = null; links = []; raw = null; renderOutputs();
  try {
    apiRoot = apiRootInput.value.replace(/\/$/, ""); clientKey = clientKeyInput.value; adminKey = adminKeyInput.value; localStorage.setItem("freed.api.root", apiRoot); localStorage.setItem("freed.api.clientKey", clientKey.trim()); localStorage.setItem("freed.api.adminKey", adminKey.trim()); setProgress(`Submitting ${op.label}`, 3);
    let payload;
    if (op.group === "opencloud") { if (op.id === "opencloud-tripo-output") payload = await uploadGeneratedToRoblox(); else if (op.id === "roblox-open-cloud") payload = await api(op.endpoint, { method: "GET" }, true); else if (op.id === "roblox-operation") { const id = String(form.operationId || "").trim(); if (!id) throw new Error("Operation ID is required."); payload = await api(`/roblox/assets/operations/${encodeURIComponent(id)}`, { method: "GET" }, true); } }
    else if (op.group === "roblox") { if (!upload) throw new Error("Choose a model file first."); const data = new FormData(); data.append("file", upload, upload.name); Object.entries(form).forEach(([key, value]) => data.append(key, String(value ?? ""))); payload = await api(op.endpoint, { method: "POST", body: data }, op.id !== "roblox-ugc-validator"); if (op.id === "roblox-ugc-validator") report = payload.roblox || null; }
    else if (op.id === "task-query") { const id = String(form.task_id || "").trim(); if (!id) throw new Error("Task ID is required."); payload = await api(`/tripo/tasks/${encodeURIComponent(id)}`, { method: "GET" }, false); }
    else if (op.id === "tripo-balance" || op.id === "tripo-usage") payload = await api(op.endpoint, { method: "GET" }, true);
    else if (op.group === "skybox") payload = await createSkybox();
    else if (op.group === "hymotion") payload = await api(op.endpoint, { method: "POST", body: JSON.stringify(compact({ ...form })) }, false);
    else { payload = await api(op.endpoint, { method: "POST", body: JSON.stringify(await buildPayload()) }, false); const id = taskId(payload); if (id) { history = [{ id, label: op.label, status: "submitted" }, ...history].slice(0, 8); renderOutputs(); payload = await poll(id); } }
    const nextLinks = linksFrom(payload); raw = payload; links = nextLinks; const id = taskId(payload); if (id) history = [{ id, label: op.label, status: taskStatus(payload) }, ...history.filter((item) => item.id !== id)].slice(0, 8); const importable = nextLinks.find(canImportLink); if (autoImport && importable) await importLink(importable); else if (op.output === "model" && taskStatus(payload) === "success" && !importable) { showError("Tripo finished but this response has no GLB/GLTF model URL. It only has preview/image output."); setProgress("No model output", 96); } else if (op.group !== "skybox") { setProgress(nextLinks.length ? "Output ready" : "API response ready", 100); if (storableModelLinks(nextLinks).length) addGeneratedPreview(); } renderOutputs();
  } catch (err) { showError(err instanceof Error ? err.message : String(err)); setProgress("Failed", 0); }
  finally { setBusy(false); }
}
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
function createMaterial(scene, name, color) { const mat = new BABYLON.StandardMaterial(name, scene); mat.diffuseColor = color; mat.specularColor = new BABYLON.Color3(0.08, 0.1, 0.12); return mat; }
function createScene() { const scene = new BABYLON.Scene(engine); scene.clearColor = new BABYLON.Color4(0.015, 0.017, 0.025, 1); const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2.35, Math.PI / 2.7, 8.4, new BABYLON.Vector3(0.25, 0.45, 0), scene); camera.attachControl(canvas, true); camera.lowerRadiusLimit = 3.2; camera.upperRadiusLimit = 16; camera.wheelDeltaPercentage = 0.01; const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.35), scene); hemi.intensity = 1.65; const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.35, -0.7, -0.45), scene); key.position = new BABYLON.Vector3(4, 6, 4); key.intensity = 0.85; const grid = BABYLON.MeshBuilder.CreateGround("studio-grid", { width: 14, height: 14, subdivisions: 28 }, scene); if (BABYLON.GridMaterial) { const gridMat = new BABYLON.GridMaterial("grid-material", scene); gridMat.majorUnitFrequency = 4; gridMat.minorUnitVisibility = 0.45; gridMat.gridRatio = 0.5; gridMat.backFaceCulling = false; gridMat.mainColor = new BABYLON.Color3(0.18, 0.2, 0.25); gridMat.lineColor = new BABYLON.Color3(0.33, 0.36, 0.45); gridMat.opacity = 0.95; grid.material = gridMat; } else grid.material = createMaterial(scene, "grid-fallback", new BABYLON.Color3(0.23, 0.25, 0.31)); const cube = BABYLON.MeshBuilder.CreateBox("cyan-block", { size: 1.55 }, scene); cube.position = new BABYLON.Vector3(1.55, 0.78, 0.2); cube.scaling.y = 1.45; cube.material = createMaterial(scene, "cyan", new BABYLON.Color3(0.26, 0.78, 0.82)); const slab = BABYLON.MeshBuilder.CreateBox("lime-slab", { width: 2.9, height: 0.55, depth: 0.75 }, scene); slab.position = new BABYLON.Vector3(-0.25, 0.55, -1.15); slab.rotation.z = -0.18; slab.material = createMaterial(scene, "lime", new BABYLON.Color3(0.74, 0.84, 0.47)); const diamond = BABYLON.MeshBuilder.CreatePolyhedron("rose-diamond", { type: 1, size: 1.45 }, scene); diamond.position = new BABYLON.Vector3(-1.05, 1.65, 0.1); diamond.rotation = new BABYLON.Vector3(0.55, 0.6, 0.45); diamond.material = createMaterial(scene, "rose", new BABYLON.Color3(0.78, 0.49, 0.39)); return { scene, camera, cube, slab, diamond }; }
const studio = createScene();
function refreshObjectCount() { countEl.textContent = String(objectCount); }
function resetCamera() { studio.camera.setTarget(new BABYLON.Vector3(0.25, 0.45, 0)); studio.camera.alpha = -Math.PI / 2.35; studio.camera.beta = Math.PI / 2.7; studio.camera.radius = 8.4; setProgress("Camera reset", 12); }
function addBlock() { const colors = [new BABYLON.Color3(0.62, 0.78, 1), new BABYLON.Color3(0.93, 0.71, 0.39), new BABYLON.Color3(0.64, 0.9, 0.67), new BABYLON.Color3(0.86, 0.61, 0.92)]; const mesh = BABYLON.MeshBuilder.CreateBox(`block-${Date.now()}`, { size: 0.78 + Math.random() * 0.45 }, studio.scene); mesh.position = new BABYLON.Vector3(-2.6 + Math.random() * 5.2, 0.65 + Math.random(), -2.0 + Math.random() * 3.7); mesh.rotation = new BABYLON.Vector3(Math.random(), Math.random(), Math.random()); mesh.material = createMaterial(studio.scene, `block-mat-${Date.now()}`, colors[textureIndex % colors.length]); textureIndex += 1; objectCount += 1; refreshObjectCount(); setProgress("Block added", 30); }
function addGeneratedPreview() { const name = `generated-${Date.now()}`; const mesh = BABYLON.MeshBuilder.CreateTorusKnot(name, { radius: 0.72, tube: 0.18, radialSegments: 80, tubularSegments: 12 }, studio.scene); mesh.position = new BABYLON.Vector3(-1.65 + Math.random() * 2.5, 1.15, 1.3 - Math.random() * 2.2); mesh.material = createMaterial(studio.scene, `${name}-mat`, new BABYLON.Color3(0.92, 0.83, 0.24)); objectCount += 1; refreshObjectCount(); return name; }
function previewUploadedFile(file) { if (!file.type.startsWith("image/")) { setProgress(`${file.name} selected`, 18); return; } const reader = new FileReader(); reader.onload = () => { const plane = BABYLON.MeshBuilder.CreatePlane(`upload-${Date.now()}`, { width: 1.7, height: 1.7 }, studio.scene); plane.position = new BABYLON.Vector3(-2.05, 1.2, -1.2); plane.rotation.y = Math.PI / 7; const texture = new BABYLON.Texture(reader.result, studio.scene); const material = new BABYLON.StandardMaterial(`upload-mat-${Date.now()}`, studio.scene); material.diffuseTexture = texture; material.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.18); plane.material = material; objectCount += 1; refreshObjectCount(); setProgress(`${file.name} uploaded`, 40); }; reader.readAsDataURL(file); }
engine.runRenderLoop(() => { studio.diamond.rotation.y += 0.004; studio.scene.render(); fpsEl.textContent = Math.round(engine.getFps()).toString(); });
window.addEventListener("resize", () => engine.resize());
resetButton.addEventListener("click", resetCamera);
addBlockButton.addEventListener("click", addBlock);
inspectorButtons.forEach((button) => button.addEventListener("click", () => toggleInspector().catch((err) => showError(err instanceof Error ? err.message : String(err)))));
modeButtons.forEach((button) => button.addEventListener("click", () => { autoImport = button.dataset.mode === "smart"; renderModes(); }));
sourceButtons.forEach((button) => button.addEventListener("click", () => switchOp(findOp(button.dataset.sourceTab))));
railButtons.forEach((button) => button.addEventListener("click", () => switchGroup(button.dataset.railTool)));
operationSelect.addEventListener("change", () => switchOp(findOp(operationSelect.value)));
privacyButton.addEventListener("click", () => { privacy = privacy === "Public" ? "Private" : "Public"; privacyLabel.textContent = privacy; setProgress(`Privacy set to ${privacy}`, 20); });
generateButton.addEventListener("click", run);
apiRootInput.addEventListener("input", () => { apiRoot = apiRootInput.value.replace(/\/$/, ""); });
clientKeyInput.addEventListener("input", () => { clientKey = clientKeyInput.value; });
adminKeyInput.addEventListener("input", () => { adminKey = adminKeyInput.value; });
historyList.addEventListener("click", (event) => { const item = event.target.closest("[data-history-id]"); if (!item) return; const query = findOp("task-query"); op = query; opId = query.id; group = query.group; form = { task_id: item.dataset.historyId }; renderAll(); });
linkList.addEventListener("click", (event) => { const button = event.target.closest("[data-link-action]"); if (!button) return; const link = links[Number(button.dataset.linkIndex)]; if (!link) return; const action = button.dataset.linkAction; const task = action === "download" ? saveLink(link) : action === "view" ? importLink(link) : uploadGeneratedToRoblox(link.url).then((payload) => { raw = payload; setProgress("Roblox upload submitted", 100); renderOutputs(); }); task.catch((err) => showError(err instanceof Error ? err.message : String(err))); });
renderAll();
setProgress("Ready", 0);
refreshObjectCount();