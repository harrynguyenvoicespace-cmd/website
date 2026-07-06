(function () {
  "use strict";

  const panel = document.querySelector("[data-ai-panel]");
  const data = window.TRIPO_PANEL_DATA;
  if (!panel || !data) return;

  const ops = data.ops || [];
  const groups = data.groups || [];
  const groupMeta = data.groupMeta || {};
  const quickOpIds = data.quickOpIds || [];
  const topologyNames = new Set(data.topologyFieldNames || []);
  const views = data.views || ["front", "left", "back", "right"];
  const skyboxFaces = data.skyboxFaces || ["front", "back", "left", "right", "up", "down"];
  const skyboxFaceLabel = data.skyboxFaceLabel || {};
  const modelExt = data.modelExt || [".glb", ".gltf", ".fbx", ".obj", ".stl", ".3mf", ".usdz"];
  const imageExt = data.imageExt || [".png", ".jpg", ".jpeg", ".webp"];
  const fileExt = data.fileExt || modelExt.concat(imageExt);
  const defaultApiRoot = data.defaultApiRoot || "/v1";
  const $ = (selector) => panel.querySelector(selector);

  const groupList = $("[data-ai-group-list]");
  const titleEl = $("[data-ai-title]");
  const operationTitle = $("[data-operation-title]");
  const operationDesc = $("[data-operation-desc]");
  const operationIcon = $("[data-operation-icon]");
  const modeButtons = panel.querySelectorAll("[data-mode]");
  const sourceTabs = $("[data-source-tabs]");
  const sourceBody = $("[data-source-body]");
  const topologyFields = $("[data-topology-fields]");
  const operationSelect = $("[data-operation-select]");
  const advancedFields = $("[data-advanced-fields]");
  const apiRootInput = $("[data-api-root]");
  const clientKeyInput = $("[data-client-key]");
  const adminKeyInput = $("[data-admin-key]");
  const errorBox = $("[data-error]");
  const progressLabel = $("[data-progress-label]");
  const progressValue = $("[data-progress-value]");
  const progressBar = $("[data-progress-bar]");
  const reportBlock = $("[data-report-block]");
  const reportStatus = $("[data-report-status]");
  const reportList = $("[data-report-list]");
  const historyBlock = $("[data-history-block]");
  const historyList = $("[data-history-list]");
  const linksBlock = $("[data-links-block]");
  const linksCount = $("[data-links-count]");
  const linkList = $("[data-link-list]");
  const rawBlock = $("[data-raw-block]");
  const rawResponse = $("[data-raw-response]");
  const generateButton = $("[data-generate-model]");

  let op = findOp("image-to-model") || ops[0];
  let group = op?.group || groups[0] || "generate";
  let form = defaults(op);
  let upload = null;
  let viewFiles = {};
  let viewUrls = Object.fromEntries(views.map((view) => [view, ""]));
  let busy = false;
  let autoImport = true;
  let links = [];
  let raw = null;
  let report = null;
  let history = [];
  let apiRoot = (localStorage.getItem("freed.api.root") || defaultApiRoot).replace(/\/+$/, "");
  let clientKey = localStorage.getItem("freed.api.clientKey") || "local-dev-key";
  let adminKey = localStorage.getItem("freed.api.adminKey") || "local-admin-key";

  function studio() { return window.bloxlabStudio || null; }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
  function esc(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
  function attr(value) { return esc(value).replace(/'/g, "&#39;"); }
  function icon(name) { return `<i data-lucide="${attr(name || "circle")}" aria-hidden="true"></i>`; }
  function findOp(id) { return ops.find((item) => item.id === id) || null; }
  function lineList(value) { return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
  function compact(value) {
    if (Array.isArray(value)) return value.map(compact).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (item === "" || item === undefined || item === null) return [];
      const next = compact(item);
      if (Array.isArray(next) && !next.length) return [];
      if (next && typeof next === "object" && !Array.isArray(next) && !Object.keys(next).length) return [];
      return [[key, next]];
    }));
  }
  function defaults(nextOp) {
    const values = {};
    (nextOp?.fields || []).forEach((field) => {
      if (field.def !== undefined) values[field.name] = field.def;
      else if (field.kind === "boolean") values[field.name] = false;
      else values[field.name] = "";
    });
    return values;
  }
  function activeFields() {
    return (op?.fields || []).filter((field) => {
      if (typeof field.show !== "function") return true;
      try { return field.show(form); } catch { return true; }
    });
  }
  function sourceFields() {
    const primary = new Set(["prompt", "input", "original_task_id", "task_id", "modelUrl", "operationId"]);
    return activeFields().filter((field) => {
      if (topologyNames.has(field.name)) return false;
      if (primary.has(field.name)) return true;
      return field.kind === "textarea" && !["negative_prompt", "rulesJson", "description"].includes(field.name);
    }).slice(0, 4);
  }
  function topologyFieldList() { return activeFields().filter((field) => topologyNames.has(field.name)); }
  function advancedFieldList() {
    const sourceNames = new Set(sourceFields().map((field) => field.name));
    return activeFields().filter((field) => !topologyNames.has(field.name) && !sourceNames.has(field.name));
  }
  function renderField(field) {
    const value = form[field.name];
    const dataAttr = `data-field="${attr(field.name)}"`;
    const label = esc(field.label || field.name);
    if (field.kind === "boolean") return `<label class="toggleRow"><input type="checkbox" ${dataAttr} ${value ? "checked" : ""} /><span>${label}</span></label>`;
    if (field.kind === "select") {
      const options = (field.options || []).map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        return `<option value="${attr(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${esc(optionLabel)}</option>`;
      }).join("");
      return `<label class="field"><span>${label}</span><select class="control" ${dataAttr}>${options}</select></label>`;
    }
    if (field.kind === "textarea" || field.kind === "multiline") return `<label class="field fieldWide"><span>${label}</span><textarea class="textarea" ${dataAttr} placeholder="${attr(field.placeholder || "")}">${esc(value)}</textarea></label>`;
    const type = field.kind === "number" ? "number" : "text";
    const numberAttrs = field.kind === "number" ? ` step="${attr(field.step ?? 1)}"${field.min !== undefined ? ` min="${attr(field.min)}"` : ""}${field.max !== undefined ? ` max="${attr(field.max)}"` : ""}` : "";
    return `<label class="field"><span>${label}</span><input class="control" type="${type}" ${dataAttr}${numberAttrs} value="${attr(value)}" placeholder="${attr(field.placeholder || "")}" /></label>`;
  }
  function connectFields(scope) {
    scope.querySelectorAll("[data-field]").forEach((control) => {
      const eventName = control.type === "checkbox" || control.tagName === "SELECT" ? "change" : "input";
      control.addEventListener(eventName, () => {
        const name = control.dataset.field;
        if (control.type === "checkbox") form[name] = control.checked;
        else if (control.type === "number") form[name] = control.value === "" ? "" : Number(control.value);
        else form[name] = control.value;
        if (["model", "texture", "animation_mode"].includes(name)) renderDynamic();
      });
    });
  }
  function setProgress(label, value) {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    progressLabel.textContent = label;
    progressValue.textContent = `${Math.round(next)}%`;
    progressBar.style.width = `${next}%`;
  }
  function showError(message) {
    errorBox.hidden = !message;
    errorBox.textContent = message || "";
  }
  function setBusy(next) {
    busy = next;
    panel.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = busy; });
    generateButton.innerHTML = next ? `${icon("loader-circle")}Working...` : `${icon("sparkles")}Run AI`;
    refreshIcons();
  }
  function uploadAccept() {
    if (op.upload === "image" || op.upload === "multiview") return imageExt.join(",");
    if (op.upload === "model") return modelExt.join(",");
    if (op.upload && op.upload !== "none") return fileExt.join(",");
    return "";
  }
  function renderUpload() {
    if (!op.upload || op.upload === "none") return "";
    if (op.upload === "multiview") {
      return `<div class="multiviewGrid">${views.map((view) => `<label class="field fieldWide"><span>${esc(view)} view</span><input class="control" type="file" accept="${attr(uploadAccept())}" data-view-file="${attr(view)}" /><input class="control" type="text" value="${attr(viewUrls[view] || "")}" placeholder="${attr(view)} URL or token" data-view-url="${attr(view)}" /></label>`).join("")}</div>`;
    }
    const fileLabel = upload ? upload.name : (op.upload === "image" ? "Upload image" : "Upload model file");
    const fileHint = op.upload === "image" ? "JPG, PNG, WEBP <= 20MB" : "GLB, GLTF, FBX, OBJ, STL, USDZ";
    return `<label class="uploadDropzone" data-upload-dropzone>${icon(op.upload === "image" ? "image-plus" : "file-box")}<strong>${esc(fileLabel)}</strong><small>${esc(fileHint)}</small><input type="file" data-upload-input accept="${attr(uploadAccept())}" /></label>`;
  }
  function renderGroups() {
    groupList.innerHTML = groups.map((id) => {
      const meta = groupMeta[id] || { label: id, icon: "circle" };
      return `<button type="button" class="${id === group ? "is-active" : ""}" data-ai-group="${attr(id)}" title="${attr(meta.label)}">${icon(meta.icon)}<span>${esc(meta.label)}</span></button>`;
    }).join("");
  }
  function renderModes() {
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === (autoImport ? "smart" : "hd");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function renderSourceTabs() {
    sourceTabs.innerHTML = quickOpIds.map(findOp).filter(Boolean).map((item) => `<button type="button" class="${item.id === op.id ? "is-active" : ""}" data-source-tab="${attr(item.id)}" title="${attr(item.label)}">${icon(item.icon)}<span>${esc(item.label.replace(/ to /i, "->"))}</span></button>`).join("");
  }
  function chooseUpload(file) {
    if (!file) return;
    upload = file;
    setProgress(`${file.name} selected`, 18);
    if (file.type.startsWith("image/")) studio()?.previewImageFile?.(file);
    renderSourceBody();
    refreshIcons();
  }
  function renderSourceBody() {
    operationTitle.textContent = op.label;
    operationDesc.textContent = op.desc || "Ready";
    operationIcon.setAttribute("data-lucide", op.icon || "sparkles");
    titleEl.textContent = groupMeta[group]?.label || op.label;
    const fields = sourceFields().map(renderField).join("");
    sourceBody.innerHTML = `${renderUpload()}${fields || (!op.upload || op.upload === "none" ? `<div class="field fieldWide"><span>Ready</span><input class="control" value="${attr(op.desc || "Run selected operation")}" disabled /></div>` : "")}`;
    connectFields(sourceBody);
    const uploadInput = sourceBody.querySelector("[data-upload-input]");
    const dropzone = sourceBody.querySelector("[data-upload-dropzone]");
    if (uploadInput) uploadInput.addEventListener("change", () => chooseUpload(uploadInput.files?.[0] || null));
    if (dropzone) {
      ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add("is-dragover"); }));
      ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove("is-dragover"); }));
      dropzone.addEventListener("drop", (event) => chooseUpload(event.dataTransfer?.files?.[0] || null));
    }
    sourceBody.querySelectorAll("[data-view-file]").forEach((input) => input.addEventListener("change", () => {
      const view = input.dataset.viewFile;
      viewFiles[view] = input.files?.[0] || null;
      if (viewFiles[view]) setProgress(`${view} view selected`, 16);
    }));
    sourceBody.querySelectorAll("[data-view-url]").forEach((input) => input.addEventListener("input", () => { viewUrls[input.dataset.viewUrl] = input.value; }));
  }
  function renderGeneral() {
    operationSelect.innerHTML = ops.filter((item) => item.group === group).map((item) => `<option value="${attr(item.id)}" ${item.id === op.id ? "selected" : ""}>${esc(item.label)}</option>`).join("");
    topologyFields.innerHTML = topologyFieldList().map(renderField).join("") || `<div class="field fieldWide"><span>Topology</span><input class="control" value="No topology settings" disabled /></div>`;
    connectFields(topologyFields);
  }
  function renderAdvanced() {
    advancedFields.innerHTML = advancedFieldList().map(renderField).join("") || `<div class="field fieldWide"><span>Advanced</span><input class="control" value="No extra settings" disabled /></div>`;
    connectFields(advancedFields);
    apiRootInput.value = apiRoot;
    clientKeyInput.value = clientKey;
    adminKeyInput.value = adminKey;
  }
  function renderOutputs() {
    reportBlock.hidden = !report;
    if (report) {
      reportStatus.textContent = report.valid === false ? "Failed" : "Ready";
      reportList.innerHTML = `<pre>${esc(JSON.stringify(report, null, 2))}</pre>`;
    }
    historyBlock.hidden = !history.length;
    historyList.innerHTML = history.map((item) => `<div class="historyItem"><span>${esc(item.label || "Task")}</span><button type="button" data-history-id="${attr(item.id)}">${esc(item.status || item.id)}</button></div>`).join("");
    linksBlock.hidden = !links.length;
    linksCount.textContent = `${links.length} file${links.length === 1 ? "" : "s"}`;
    linkList.innerHTML = links.map((link, index) => {
      const actions = [`<button type="button" data-link-action="download" data-link-index="${index}">Download</button>`];
      if (canImportLink(link)) actions.unshift(`<button type="button" data-link-action="view" data-link-index="${index}">View</button>`);
      if (link.kind === "model") actions.push(`<button type="button" data-link-action="roblox" data-link-index="${index}">Roblox</button>`);
      return `<article class="linkCard"><div class="linkTop"><strong>${esc(link.label)}</strong><span>${esc(link.kind)}</span></div><p title="${attr(link.url)}">${esc(link.url)}</p><div class="linkActions">${actions.join("")}</div></article>`;
    }).join("");
    rawBlock.hidden = !raw;
    if (raw) rawResponse.textContent = JSON.stringify(raw, null, 2);
    panel.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = busy; });
  }
  function renderDynamic() {
    renderSourceBody();
    renderGeneral();
    renderAdvanced();
    refreshIcons();
    panel.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = busy; });
  }
  function renderAll() {
    renderGroups();
    renderModes();
    renderSourceTabs();
    renderDynamic();
    renderOutputs();
  }
  function switchOp(nextOp, syncGroup = true) {
    if (!nextOp) return;
    op = nextOp;
    if (syncGroup) group = op.group;
    form = defaults(op);
    upload = null;
    viewFiles = {};
    viewUrls = Object.fromEntries(views.map((view) => [view, ""]));
    links = [];
    raw = null;
    report = null;
    showError("");
    setProgress(`${op.label} ready`, 0);
    renderAll();
  }
  function switchGroup(nextGroup) {
    group = nextGroup;
    switchOp(ops.find((item) => item.group === nextGroup) || op, false);
  }
  function extOf(url) {
    try { return new URL(url).pathname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ""; }
    catch { return String(url).toLowerCase().split("?")[0].match(/\.[a-z0-9]+$/)?.[0] || ""; }
  }
  function linkKind(key, url) {
    const ext = extOf(url);
    if (modelExt.includes(ext) || /model|mesh|glb|gltf|fbx|obj|stl|usdz/i.test(key)) return "model";
    if (imageExt.includes(ext) || /image|render|preview|thumbnail|texture|skybox/i.test(key)) return "image";
    return fileExt.includes(ext) ? "file" : "url";
  }
  function canImportLink(link) { return /\.(glb|gltf)(\?|$)/i.test(link.url || "") || /glb|gltf/i.test(link.key || ""); }
  function labelUrl(key, url) {
    const ext = extOf(url).replace(".", "").toUpperCase();
    return `${String(key || "output").replace(/[_-]+/g, " ")}${ext ? ` ${ext}` : ""}`;
  }
  function linksFrom(payload) {
    const found = [];
    const seen = new Set();
    const seenObj = new Set();
    const add = (key, url) => {
      if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
      const ext = extOf(url);
      if (!ext && !/url|output|download|model|mesh|gltf|glb|image|render|animation|file|skybox/i.test(key)) return;
      seen.add(url);
      found.push({ label: labelUrl(key, url), url, key, kind: linkKind(key, url) });
    };
    const walk = (value, key = "output") => {
      if (!value) return;
      if (typeof value === "string") { add(key, value); return; }
      if (typeof value !== "object" || seenObj.has(value)) return;
      seenObj.add(value);
      if (Array.isArray(value)) value.forEach((item) => walk(item, key));
      else Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
    };
    [payload?.data?.output, payload?.output, payload?.tripo?.data?.output, payload?.tripo?.output].filter(Boolean).forEach((output) => {
      ["model_url", "pbr_model_url", "base_model_url", "raw_model_url", "glb_url", "gltf_url", "rendered_image", "image_url"].forEach((key) => {
        if (typeof output?.[key] === "string") add(key, output[key]);
      });
    });
    walk(payload);
    const rank = (link) => canImportLink(link) ? 0 : link.kind === "model" ? 1 : link.kind === "file" ? 2 : 3;
    return found.sort((a, b) => rank(a) - rank(b));
  }
  function taskId(payload) { return payload?.task_id || payload?.data?.task_id || payload?.id || payload?.data?.id || payload?.tripo?.task_id || payload?.tripo?.data?.task_id || payload?.result?.task_id || null; }
  function taskStatus(payload) { return String(payload?.status || payload?.data?.status || payload?.tripo?.status || payload?.tripo?.data?.status || payload?.result?.status || "unknown").toLowerCase(); }
  function compactStringify(value, max = 900) {
    try {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return text.length > max ? `${text.slice(0, max)}...` : text;
    } catch { return String(value).slice(0, max); }
  }
  function payloadMessage(payload, fallback = "Unknown API error") {
    return String(payload?.error?.message || payload?.message || payload?.data?.error_msg || payload?.data?.error_message || payload?.data?.message || payload?.tripo?.message || payload?.tripo?.data?.error_msg || payload?.raw || fallback);
  }
  function detailedMessage(title, payload) {
    const status = taskStatus(payload);
    const id = taskId(payload);
    const base = payloadMessage(payload, title);
    const details = compactStringify(payload?.error?.details || payload?.details || payload?.data || payload, 700);
    const meta = [id ? `task ${id}` : "", status && status !== "unknown" ? `status ${status}` : ""].filter(Boolean).join(", ");
    return `${title}${meta ? ` (${meta})` : ""}: ${base}${details && details !== base ? ` | ${details}` : ""}`;
  }
  function makeHeaders(json = true, admin = true) {
    const headers = new Headers();
    if (clientKey.trim()) headers.set("x-api-key", clientKey.trim());
    if (adminKey.trim() && admin) headers.set("x-admin-key", adminKey.trim());
    if (json) headers.set("content-type", "application/json");
    return headers;
  }
  async function readResponse(response) {
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok || payload.ok === false) throw new Error(detailedMessage(`HTTP ${response.status} ${response.statusText || "API error"}`, payload));
    return payload;
  }
  async function api(path, init = {}, admin = true) {
    const headers = makeHeaders(!(init.body instanceof FormData), admin);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    return readResponse(await fetch(`${apiRoot}${path}`, { ...init, headers }));
  }
  async function uploadTripo(file) {
    setProgress("Uploading file", 10);
    const body = new FormData();
    body.append("file", file, file.name);
    const payload = await api("/tripo/upload", { method: "POST", body }, false);
    const token = payload?.image_token || payload?.file_token || payload?.data?.image_token || payload?.data?.file_token;
    if (!token) throw new Error("Upload did not return file token.");
    return String(token);
  }
  async function buildPayload() {
    const payload = {};
    activeFields().forEach((field) => {
      if (["inputs_text", "part_names_text", "animations_text"].includes(field.name)) return;
      const value = form[field.name];
      if (field.kind === "number") { if (value !== "" && value !== undefined) payload[field.name] = Number(value); return; }
      if (field.kind === "boolean") { payload[field.name] = Boolean(value); return; }
      if (value !== "" && value !== undefined) payload[field.name] = value;
    });
    if (form.inputs_text) payload.inputs = lineList(form.inputs_text);
    if (form.part_names_text) payload.part_names = lineList(form.part_names_text);
    if (form.animation_mode === "multiple") { payload.animations = lineList(form.animations_text); delete payload.animation; }
    if (op.upload === "multiview") {
      const inputs = {};
      for (const view of views) {
        if (viewFiles[view]) inputs[view] = await uploadTripo(viewFiles[view]);
        else if (String(viewUrls[view] || "").trim()) inputs[view] = String(viewUrls[view]).trim();
      }
      if (Object.keys(inputs).length) payload.inputs = inputs;
    } else if (upload && op.upload && op.upload !== "none") {
      const token = await uploadTripo(upload);
      if (op.id === "image-to-model") { delete payload.input; payload.image_token = token; }
      else payload.input = token;
    }
    return compact(payload);
  }
  async function poll(id) {
    const done = ["success", "succeeded", "complete", "completed"];
    const failed = ["failed", "cancelled", "canceled", "banned", "expired"];
    for (let i = 0; i < 180; i += 1) {
      const payload = await api(`/tripo/tasks/${encodeURIComponent(id)}`, { method: "GET" }, false);
      raw = payload;
      links = linksFrom(payload);
      renderOutputs();
      const status = taskStatus(payload);
      setProgress(`Tripo ${status}${links.length && !done.includes(status) ? " - waiting final output" : ""}`, done.includes(status) ? 96 : Math.min(95, 12 + Math.floor(i * 0.7)));
      if (failed.includes(status)) throw new Error(JSON.stringify(payload?.data || payload).slice(0, 500));
      if (done.includes(status)) return payload;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Task polling timed out.");
  }
  function skyboxPrompt(basePrompt, face) {
    return [basePrompt, `Roblox-style seamless cube-map skybox ${skyboxFaceLabel[face] || face} face.`, "Square 1:1 environment texture, continuous horizon, soft lighting, no UI, no text, no character, no foreground object.", "Make this face align naturally with the other cube faces."].join(" ");
  }
  function firstImageLink(payload) {
    return linksFrom(payload).find((link) => link.kind === "image" || imageExt.some((ext) => link.url.split("?")[0].toLowerCase().endsWith(ext)));
  }
  async function createSkybox() {
    const basePrompt = String(form.prompt || "").trim();
    if (!basePrompt) throw new Error("Skybox prompt is required.");
    const submissions = [];
    setProgress("Submitting 6 skybox faces", 5);
    for (const [index, face] of skyboxFaces.entries()) {
      setProgress(`Submitting skybox ${skyboxFaceLabel[face] || face} ${index + 1}/6`, 5 + index * 2);
      const payload = await api("/tripo/generation/text-to-image", { method: "POST", body: JSON.stringify(compact({ prompt: skyboxPrompt(basePrompt, face), model: String(form.model || "seedream_v5"), template: String(form.template || "") })) }, false);
      raw = payload;
      const id = taskId(payload);
      if (id) history = [{ id, label: `Skybox ${skyboxFaceLabel[face] || face}`, status: "submitted" }, ...history].slice(0, 8);
      submissions.push({ face, id, payload });
      renderOutputs();
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    const faceLinks = [];
    for (const [index, item] of submissions.entries()) {
      const payload = item.id ? await poll(item.id) : item.payload;
      const image = firstImageLink(payload);
      if (image) faceLinks.push({ ...image, label: `Skybox ${skyboxFaceLabel[item.face] || item.face}`, key: `skybox_${item.face}`, face: item.face });
      setProgress(`Skybox face ready ${index + 1}/6`, Math.min(96, 10 + (index + 1) * 14));
    }
    const faceMap = faceLinks.reduce((acc, link) => ({ ...acc, [link.face]: link.url }), {});
    links = faceLinks.map(({ face, ...link }) => link);
    raw = { status: "success", skybox_faces: faceMap };
    studio()?.setSkyboxFromImageUrls?.(faceMap);
    setProgress("Skybox in viewport", 100);
    renderOutputs();
    return raw;
  }
  function filename(link) {
    try { return new URL(link.url).pathname.split("/").pop() || `output${extOf(link.url) || ".bin"}`; }
    catch { return `output${extOf(link.url) || ".bin"}`; }
  }
  function downloadUrl(link) {
    if (link.url.includes("/hymotion/animations/") || link.url.startsWith(apiRoot)) return link.url;
    return `${apiRoot}/tripo/download?url=${encodeURIComponent(link.url)}`;
  }
  async function saveLink(link) {
    const anchor = document.createElement("a");
    anchor.href = downloadUrl(link);
    anchor.download = filename(link);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setProgress("Downloaded", 100);
  }
  async function uploadGeneratedToRoblox(modelUrl) {
    const outputUrl = String(modelUrl || form.modelUrl || links.find((link) => link.kind === "model" || /\.(glb|gltf|fbx|rbxm|rbxmx)(\?|$)/i.test(link.url))?.url || "").trim();
    if (!outputUrl) throw new Error("No Tripo model URL. Generate a model first or paste a model URL.");
    setProgress("Downloading Tripo output", 25);
    const virtualLink = { label: "Tripo Output", url: outputUrl, kind: "model", key: "opencloud" };
    const response = await fetch(downloadUrl(virtualLink), { headers: { "x-api-key": clientKey.trim() } });
    if (!response.ok) throw new Error(`Download failed HTTP ${response.status}`);
    const blob = await response.blob();
    let fileName = filename(virtualLink).replace(/[^\w .-]+/g, " ").trim() || "tripo-output.glb";
    if (!/\.(glb|gltf|fbx|rbxm|rbxmx)$/i.test(fileName)) fileName += ".glb";
    const body = new FormData();
    body.append("displayName", String(form.displayName || fileName.replace(/\.[^.]+$/, "") || "Tripo Generated Model"));
    body.append("description", String(form.description || "Uploaded from Bloxlab website."));
    body.append("dryRun", String(Boolean(form.dryRun)));
    body.append("file", new File([blob], fileName, { type: blob.type || "model/gltf-binary" }));
    setProgress("Uploading to Roblox Open Cloud", 65);
    return api("/roblox/assets/models", { method: "POST", body }, true);
  }
  async function importLink(link) {
    if (!canImportLink(link)) throw new Error("Viewport supports GLB/GLTF import. Convert to GLTF first.");
    setProgress("Loading model into viewport", 98);
    await studio()?.importModelLink?.(link.url);
    setProgress("Model in viewport", 100);
  }
  async function run() {
    setBusy(true);
    showError("");
    report = null;
    links = [];
    raw = null;
    renderOutputs();
    try {
      apiRoot = (apiRootInput.value || defaultApiRoot).replace(/\/+$/, "");
      clientKey = clientKeyInput.value;
      adminKey = adminKeyInput.value;
      localStorage.setItem("freed.api.root", apiRoot);
      localStorage.setItem("freed.api.clientKey", clientKey.trim());
      localStorage.setItem("freed.api.adminKey", adminKey.trim());
      setProgress(`Submitting ${op.label}`, 3);
      let payload;
      if (op.group === "opencloud") {
        if (op.id === "opencloud-tripo-output") payload = await uploadGeneratedToRoblox();
        else if (op.id === "roblox-open-cloud") payload = await api(op.endpoint, { method: "GET" }, true);
        else if (op.id === "roblox-operation") {
          const id = String(form.operationId || "").trim();
          if (!id) throw new Error("Operation ID is required.");
          payload = await api(`/roblox/assets/operations/${encodeURIComponent(id)}`, { method: "GET" }, true);
        }
      } else if (op.group === "roblox") {
        if (!upload) throw new Error("Choose a model file first.");
        const body = new FormData();
        body.append("file", upload, upload.name);
        Object.entries(form).forEach(([key, value]) => body.append(key, String(value ?? "")));
        payload = await api(op.endpoint, { method: "POST", body }, op.id !== "roblox-ugc-validator");
        if (op.id === "roblox-ugc-validator") report = payload.roblox || null;
      } else if (op.id === "task-query") {
        const id = String(form.task_id || "").trim();
        if (!id) throw new Error("Task ID is required.");
        payload = await api(`/tripo/tasks/${encodeURIComponent(id)}`, { method: "GET" }, false);
      } else if (op.id === "tripo-balance" || op.id === "tripo-usage") {
        payload = await api(op.endpoint, { method: "GET" }, true);
      } else if (op.group === "skybox") {
        payload = await createSkybox();
      } else if (op.group === "hymotion") {
        payload = await api(op.endpoint, { method: "POST", body: JSON.stringify(compact({ ...form })) }, false);
      } else {
        payload = await api(op.endpoint, { method: "POST", body: JSON.stringify(await buildPayload()) }, false);
        const id = taskId(payload);
        if (id) {
          history = [{ id, label: op.label, status: "submitted" }, ...history].slice(0, 8);
          renderOutputs();
          payload = await poll(id);
        }
      }
      const nextLinks = linksFrom(payload);
      raw = payload;
      links = nextLinks.length ? nextLinks : links;
      const id = taskId(payload);
      if (id) history = [{ id, label: op.label, status: taskStatus(payload) }, ...history.filter((item) => item.id !== id)].slice(0, 8);
      const importable = links.find(canImportLink);
      if (autoImport && importable) await importLink(importable);
      else if (op.output === "model" && taskStatus(payload) === "success" && !importable) {
        showError("Tripo finished but this response has no GLB/GLTF model URL. It only has preview/image output.");
        setProgress("No model output", 96);
      } else if (op.group !== "skybox") {
        setProgress(links.length ? "Output ready" : "API response ready", 100);
        if (links.some((link) => link.kind === "model")) studio()?.addGeneratedPreview?.();
      }
      renderOutputs();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      setProgress("Failed", 0);
    } finally {
      setBusy(false);
    }
  }

  groupList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-group]");
    if (button) switchGroup(button.dataset.aiGroup);
  });
  sourceTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-tab]");
    if (button) switchOp(findOp(button.dataset.sourceTab));
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    autoImport = button.dataset.mode === "smart";
    renderModes();
    setProgress(autoImport ? "Smart import enabled" : "HD output mode", 10);
  }));
  operationSelect.addEventListener("change", () => switchOp(findOp(operationSelect.value)));
  apiRootInput.addEventListener("input", () => { apiRoot = apiRootInput.value.replace(/\/+$/, ""); });
  clientKeyInput.addEventListener("input", () => { clientKey = clientKeyInput.value; });
  adminKeyInput.addEventListener("input", () => { adminKey = adminKeyInput.value; });
  generateButton.addEventListener("click", run);
  historyList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-history-id]");
    if (!item) return;
    const query = findOp("task-query");
    op = query;
    group = query.group;
    form = { task_id: item.dataset.historyId };
    upload = null;
    links = [];
    raw = null;
    report = null;
    renderAll();
  });
  linkList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-link-action]");
    if (!button) return;
    const link = links[Number(button.dataset.linkIndex)];
    if (!link) return;
    const action = button.dataset.linkAction;
    const task = action === "download" ? saveLink(link) : action === "view" ? importLink(link) : uploadGeneratedToRoblox(link.url).then((payload) => {
      raw = payload;
      links = linksFrom(payload);
      setProgress("Roblox upload submitted", 100);
      renderOutputs();
    });
    task.catch((err) => {
      showError(err instanceof Error ? err.message : String(err));
      setProgress("Action failed", 0);
    });
  });

  renderAll();
  setProgress("Ready", 0);
  refreshIcons();
})();
