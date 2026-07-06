const config = window.BLOXLAB_CONFIG || { sessionKey: "bloxlab.session" };
const session = localStorage.getItem(config.sessionKey || "bloxlab.session");

if (!session) {
  window.location.href = "./login.html";
}

if (!window.BABYLON) {
  document.body.innerHTML = "<main class='studio-shell'><section class='viewport-panel'><h1>BabylonJS failed to load</h1></section></main>";
  throw new Error("BabylonJS CDN did not load.");
}

const canvas = document.getElementById("studioCanvas");
const fpsEl = document.querySelector("[data-fps]");
const objectCountEl = document.querySelector("[data-object-count]");
const sceneListEl = document.querySelector("[data-scene-list]");
const selectedNameEls = document.querySelectorAll("[data-selected-name]");
const propertyNameEl = document.querySelector("[data-property-name]");
const propertyTypeEl = document.querySelector("[data-property-type]");
const propertiesStateEl = document.querySelector("[data-properties-state]");
const currentToolEl = document.querySelector("[data-current-tool]");
const hudToolEl = document.querySelector("[data-hud-tool]");
const saveStateEl = document.querySelector("[data-save-state]");
const transformInputs = document.querySelectorAll("[data-transform-field]");
const colorInput = document.querySelector("[data-material-color]");
const materialTypeSelect = document.querySelector("[data-material-type]");
const profilerPanel = document.querySelector("[data-profiler]");
const profilerEls = {
  fps: document.querySelector("[data-profiler-fps]"),
  meshes: document.querySelector("[data-profiler-meshes]"),
  active: document.querySelector("[data-profiler-active]"),
  materials: document.querySelector("[data-profiler-materials]"),
};

const TOOL_LABELS = {
  select: "Select",
  move: "Move",
  scale: "Scale",
  rotate: "Rotate",
  transform: "Transform",
};

let selectedMesh = null;
let currentTool = "select";
let snapEnabled = true;
let gridVisible = true;
let profilerOpen = false;
let blockIndex = 4;
let isRefreshingProperties = false;

const engine = new BABYLON.Engine(canvas, true, {
  antialias: true,
  preserveDrawingBuffer: true,
  stencil: true,
});

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.72, 0.86, 0.96, 1);
scene.collisionsEnabled = false;

const camera = new BABYLON.ArcRotateCamera(
  "EditorCamera",
  -Math.PI / 2.35,
  Math.PI / 2.85,
  12,
  new BABYLON.Vector3(0, 1.1, 0),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 42;
camera.wheelDeltaPercentage = 0.012;
camera.panningSensibility = 80;
camera.useAutoRotationBehavior = false;

const highlightLayer = new BABYLON.HighlightLayer("EditorSelection", scene);
highlightLayer.blurHorizontalSize = 0.7;
highlightLayer.blurVerticalSize = 0.7;

const hemi = new BABYLON.HemisphericLight("ViewportSkyLight", new BABYLON.Vector3(0.25, 1, 0.3), scene);
hemi.intensity = 0.92;
hemi.groundColor = new BABYLON.Color3(0.62, 0.66, 0.7);

const key = new BABYLON.DirectionalLight("ViewportKeyLight", new BABYLON.Vector3(-0.45, -0.72, -0.35), scene);
key.position = new BABYLON.Vector3(7, 12, 7);
key.intensity = 1.35;

const gizmoManager = new BABYLON.GizmoManager(scene, 1.18);
gizmoManager.usePointerToAttachGizmos = false;
gizmoManager.enableAutoPicking = false;
gizmoManager.clearGizmoOnEmptyPointerEvent = false;
gizmoManager.boundingBoxGizmoEnabled = false;

const grid = createGrid();
createDefaultSkybox();
createStarterScene();
setTool("select");
selectMesh(findEditableMeshes()[0] || null);

window.bloxlabStudio = {
  scene,
  engine,
  camera,
  selectMesh,
  setTool,
  getSelectedMesh: () => selectedMesh,
  getEditableMeshes: findEditableMeshes,
};

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function setStatus(message) {
  if (saveStateEl) saveStateEl.textContent = message;
}

function createMaterial(name, color, surface = "matte") {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = color.clone();
  material.metadata = { surface };
  applyMaterialSurface(material, surface, color);
  return material;
}

function applyMaterialSurface(material, surface, color = material.diffuseColor || BABYLON.Color3.White()) {
  material.alpha = 1;
  material.specularPower = 32;
  material.emissiveColor = BABYLON.Color3.Black();
  material.specularColor = new BABYLON.Color3(0.12, 0.14, 0.16);
  material.metadata = { ...(material.metadata || {}), surface };

  if (surface === "metal") {
    material.specularColor = new BABYLON.Color3(0.78, 0.82, 0.86);
    material.specularPower = 96;
  } else if (surface === "glass") {
    material.alpha = 0.48;
    material.specularColor = new BABYLON.Color3(0.9, 0.96, 1);
    material.specularPower = 128;
  } else if (surface === "emissive") {
    material.emissiveColor = color.scale(0.62);
    material.specularColor = color.scale(0.2);
  }
}

function createGrid() {
  const ground = BABYLON.MeshBuilder.CreateGround("StudioGrid", { width: 90, height: 90, subdivisions: 90 }, scene);
  ground.isPickable = false;
  ground.metadata = { editorLocked: true };

  if (BABYLON.GridMaterial) {
    const gridMaterial = new BABYLON.GridMaterial("StudioGridMaterial", scene);
    gridMaterial.majorUnitFrequency = 8;
    gridMaterial.minorUnitVisibility = 0.42;
    gridMaterial.gridRatio = 1;
    gridMaterial.backFaceCulling = false;
    gridMaterial.mainColor = new BABYLON.Color3(0.84, 0.88, 0.91);
    gridMaterial.lineColor = new BABYLON.Color3(0.55, 0.63, 0.72);
    gridMaterial.opacity = 0.72;
    ground.material = gridMaterial;
  } else {
    ground.material = createMaterial("StudioGridFallback", new BABYLON.Color3(0.82, 0.86, 0.9));
  }

  return ground;
}

function drawSkyFace(texture, face) {
  const ctx = texture.getContext();
  const size = texture.getSize().width;
  ctx.clearRect(0, 0, size, size);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  const isTop = face === "up";
  const isBottom = face === "down";
  gradient.addColorStop(0, isBottom ? "#e7f0ef" : isTop ? "#67b6ee" : "#81c7f4");
  gradient.addColorStop(0.58, isBottom ? "#d7e0d5" : "#dff5ff");
  gradient.addColorStop(1, isTop ? "#bde8ff" : "#f8fbf2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  if (!isTop && !isBottom) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    for (let i = 0; i < 7; i += 1) {
      const x = (i * 93 + face.length * 31) % size;
      const y = 120 + ((i * 37) % 130);
      ctx.beginPath();
      ctx.ellipse(x, y, 52, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 32, y - 9, 34, 19, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 31, y - 4, 28, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(238, 244, 228, 0.76)";
    ctx.fillRect(0, size * 0.72, size, size * 0.28);
  }

  if (isTop) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
    for (let i = 0; i < 11; i += 1) {
      ctx.beginPath();
      ctx.arc((i * 57) % size, (i * 83) % size, 28 + (i % 3) * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  texture.update(false);
}

function makeSkyMaterial(name, face) {
  const texture = new BABYLON.DynamicTexture(`${name}Texture`, { width: 512, height: 512 }, scene, false);
  drawSkyFace(texture, face);
  texture.hasAlpha = false;

  const material = new BABYLON.StandardMaterial(name, scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.diffuseColor = BABYLON.Color3.White();
  material.specularColor = BABYLON.Color3.Black();
  material.metadata = { skybox: true };
  return material;
}

function createSkyFace(root, face, position, rotation) {
  const mesh = BABYLON.MeshBuilder.CreatePlane(`SkyboxFace_${face}`, { size: 900 }, scene);
  mesh.parent = root;
  mesh.position.copyFrom(position);
  mesh.rotation.copyFrom(rotation);
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = true;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.metadata = { editorLocked: true, skybox: true };
  mesh.material = makeSkyMaterial(`SkyboxMaterial_${face}`, face);
  return mesh;
}

function createDefaultSkybox() {
  const root = new BABYLON.TransformNode("DefaultViewportSkybox", scene);
  root.metadata = { editorLocked: true, skybox: true };
  const half = 450;
  createSkyFace(root, "front", new BABYLON.Vector3(0, 0, half), new BABYLON.Vector3(0, Math.PI, 0));
  createSkyFace(root, "back", new BABYLON.Vector3(0, 0, -half), BABYLON.Vector3.Zero());
  createSkyFace(root, "right", new BABYLON.Vector3(half, 0, 0), new BABYLON.Vector3(0, -Math.PI / 2, 0));
  createSkyFace(root, "left", new BABYLON.Vector3(-half, 0, 0), new BABYLON.Vector3(0, Math.PI / 2, 0));
  createSkyFace(root, "up", new BABYLON.Vector3(0, half, 0), new BABYLON.Vector3(Math.PI / 2, 0, 0));
  createSkyFace(root, "down", new BABYLON.Vector3(0, -half, 0), new BABYLON.Vector3(-Math.PI / 2, 0, 0));

  scene.onBeforeRenderObservable.add(() => {
    root.position.copyFrom(camera.globalPosition);
  });
}

function markEditable(mesh, type) {
  mesh.metadata = { ...(mesh.metadata || {}), editable: true, type };
  mesh.isPickable = true;
  return mesh;
}

function createStarterScene() {
  const cube = markEditable(BABYLON.MeshBuilder.CreateBox("Aqua Tower", { width: 1.55, height: 2.5, depth: 1.55 }, scene), "Part");
  cube.position = new BABYLON.Vector3(1.6, 1.25, 0.2);
  cube.material = createMaterial("AquaMaterial", new BABYLON.Color3(0.28, 0.75, 0.78), "matte");

  const slab = markEditable(BABYLON.MeshBuilder.CreateBox("Lime Beam", { width: 3.2, height: 0.48, depth: 0.75 }, scene), "Part");
  slab.position = new BABYLON.Vector3(-0.25, 0.62, -1.18);
  slab.rotation.z = -0.18;
  slab.material = createMaterial("LimeMaterial", new BABYLON.Color3(0.72, 0.82, 0.48), "matte");

  const diamond = markEditable(BABYLON.MeshBuilder.CreatePolyhedron("Copper Octa", { type: 1, size: 1.55 }, scene), "Mesh");
  diamond.position = new BABYLON.Vector3(-1.15, 1.7, 0.18);
  diamond.rotation = new BABYLON.Vector3(0.55, 0.6, 0.45);
  diamond.material = createMaterial("CopperMaterial", new BABYLON.Color3(0.77, 0.49, 0.38), "metal");

  refreshSceneList();
}

function findEditableMeshes() {
  return scene.meshes.filter((mesh) => mesh.metadata?.editable && !mesh.isDisposed());
}

function displayName(mesh) {
  return mesh?.name || "Unnamed";
}

function selectMesh(mesh) {
  if (selectedMesh === mesh) {
    refreshSelectionUi();
    return;
  }

  if (selectedMesh) highlightLayer.removeMesh(selectedMesh);
  selectedMesh = mesh && mesh.metadata?.editable ? mesh : null;

  if (selectedMesh) {
    highlightLayer.addMesh(selectedMesh, new BABYLON.Color3(0.08, 0.5, 0.85));
    gizmoManager.attachToMesh(currentTool === "select" ? null : selectedMesh);
    setStatus(`${displayName(selectedMesh)} selected`);
  } else {
    gizmoManager.attachToMesh(null);
    setStatus("No object selected");
  }

  refreshSelectionUi();
  refreshSceneList();
}

function refreshSelectionUi() {
  const name = selectedMesh ? displayName(selectedMesh) : "None";
  selectedNameEls.forEach((el) => { el.textContent = name; });
  propertyNameEl.textContent = selectedMesh ? displayName(selectedMesh) : "No object selected";
  propertyTypeEl.textContent = selectedMesh ? selectedMesh.metadata?.type || "Mesh" : "Select a mesh in the viewport or explorer.";
  propertiesStateEl.textContent = selectedMesh ? "Live" : "Idle";

  transformInputs.forEach((input) => { input.disabled = !selectedMesh; });
  colorInput.disabled = !selectedMesh;
  materialTypeSelect.disabled = !selectedMesh;

  if (!selectedMesh) {
    transformInputs.forEach((input) => { input.value = ""; });
    return;
  }

  updatePropertyInputsFromMesh();
}

function meshRotation(mesh) {
  if (mesh.rotationQuaternion) return mesh.rotationQuaternion.toEulerAngles();
  return mesh.rotation;
}

function updatePropertyInputsFromMesh() {
  if (!selectedMesh || document.activeElement?.matches("[data-transform-field]") || isRefreshingProperties) return;
  isRefreshingProperties = true;
  const rotation = meshRotation(selectedMesh);
  const values = {
    "position.x": selectedMesh.position.x,
    "position.y": selectedMesh.position.y,
    "position.z": selectedMesh.position.z,
    "rotation.x": BABYLON.Tools.ToDegrees(rotation.x),
    "rotation.y": BABYLON.Tools.ToDegrees(rotation.y),
    "rotation.z": BABYLON.Tools.ToDegrees(rotation.z),
    "scaling.x": selectedMesh.scaling.x,
    "scaling.y": selectedMesh.scaling.y,
    "scaling.z": selectedMesh.scaling.z,
  };
  transformInputs.forEach((input) => {
    input.value = Number(values[input.dataset.transformField] || 0).toFixed(input.dataset.transformField.startsWith("rotation") ? 0 : 2);
  });
  colorInput.value = colorToHex(selectedMesh.material?.diffuseColor || BABYLON.Color3.White());
  materialTypeSelect.value = selectedMesh.material?.metadata?.surface || "matte";
  isRefreshingProperties = false;
}

function applyPropertyInput(input) {
  if (!selectedMesh) return;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  const [group, axis] = input.dataset.transformField.split(".");
  if (group === "position") selectedMesh.position[axis] = value;
  if (group === "scaling") selectedMesh.scaling[axis] = Math.max(0.05, value);
  if (group === "rotation") {
    selectedMesh.rotationQuaternion = null;
    selectedMesh.rotation[axis] = BABYLON.Tools.ToRadians(value);
  }
  setStatus(`${displayName(selectedMesh)} updated`);
  refreshSceneList();
}

function colorToHex(color) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${[clamp(color.r), clamp(color.g), clamp(color.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hexToColor(hex) {
  const value = String(hex || "#ffffff").replace("#", "");
  const int = Number.parseInt(value, 16);
  return new BABYLON.Color3(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function refreshSceneList() {
  const meshes = findEditableMeshes();
  objectCountEl.textContent = String(meshes.length);
  sceneListEl.innerHTML = meshes.map((mesh, index) => `
    <button class="scene-item ${mesh === selectedMesh ? "is-selected" : ""}" type="button" data-mesh-id="${mesh.uniqueId}">
      <i data-lucide="box" aria-hidden="true"></i>
      <span>${escapeHtml(displayName(mesh))}</span>
      <small>${index + 1}</small>
    </button>
  `).join("");
  refreshIcons();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function setTool(tool) {
  currentTool = TOOL_LABELS[tool] ? tool : "select";
  gizmoManager.positionGizmoEnabled = currentTool === "move" || currentTool === "transform";
  gizmoManager.rotationGizmoEnabled = currentTool === "rotate" || currentTool === "transform";
  gizmoManager.scaleGizmoEnabled = currentTool === "scale" || currentTool === "transform";
  gizmoManager.boundingBoxGizmoEnabled = false;
  configureSnap();
  wireGizmoObservers();
  gizmoManager.attachToMesh(currentTool === "select" ? null : selectedMesh);

  document.querySelectorAll("[data-tool], [data-tool-shortcut]").forEach((button) => {
    const buttonTool = button.dataset.tool || button.dataset.toolShortcut;
    button.classList.toggle("is-active", buttonTool === currentTool);
  });
  currentToolEl.textContent = TOOL_LABELS[currentTool];
  hudToolEl.textContent = TOOL_LABELS[currentTool];
  setStatus(`Tool: ${TOOL_LABELS[currentTool]}`);
}

function configureSnap() {
  const { positionGizmo, rotationGizmo, scaleGizmo } = gizmoManager.gizmos;
  if (positionGizmo) {
    positionGizmo.snapDistance = snapEnabled ? 0.5 : 0;
    positionGizmo.planarGizmoEnabled = true;
  }
  if (rotationGizmo) rotationGizmo.snapDistance = snapEnabled ? Math.PI / 4 : 0;
  if (scaleGizmo) {
    scaleGizmo.snapDistance = snapEnabled ? 0.25 : 0;
    scaleGizmo.incrementalSnap = true;
  }
}

function wireGizmoObservers() {
  [gizmoManager.gizmos.positionGizmo, gizmoManager.gizmos.rotationGizmo, gizmoManager.gizmos.scaleGizmo]
    .filter(Boolean)
    .forEach((gizmo) => {
      if (gizmo.__bloxlabWired) return;
      gizmo.__bloxlabWired = true;
      gizmo.onDragObservable.add(() => updatePropertyInputsFromMesh());
      gizmo.onDragEndObservable.add(() => {
        updatePropertyInputsFromMesh();
        setStatus(`${TOOL_LABELS[currentTool]} applied`);
      });
    });
}

function addBox() {
  const mesh = markEditable(BABYLON.MeshBuilder.CreateBox(`Part ${blockIndex}`, { size: 1.15 }, scene), "Part");
  mesh.position = new BABYLON.Vector3(-2.5 + Math.random() * 5, 0.75 + Math.random(), -2 + Math.random() * 4);
  mesh.rotation = new BABYLON.Vector3(0, Math.random() * Math.PI, 0);
  mesh.material = createMaterial(`PartMaterial_${blockIndex}`, new BABYLON.Color3(0.36, 0.62, 0.92), "matte");
  blockIndex += 1;
  selectMesh(mesh);
  refreshSceneList();
}

function addSphere() {
  const mesh = markEditable(BABYLON.MeshBuilder.CreateSphere(`Sphere ${blockIndex}`, { diameter: 1.2, segments: 32 }, scene), "Mesh");
  mesh.position = new BABYLON.Vector3(-2.5 + Math.random() * 5, 0.8 + Math.random(), -2 + Math.random() * 4);
  mesh.material = createMaterial(`SphereMaterial_${blockIndex}`, new BABYLON.Color3(0.92, 0.34, 0.32), "glass");
  blockIndex += 1;
  selectMesh(mesh);
  refreshSceneList();
}

function deleteSelected() {
  if (!selectedMesh) {
    setStatus("Select an object before deleting");
    return;
  }
  const nextSelection = findEditableMeshes().find((mesh) => mesh !== selectedMesh) || null;
  const deletedName = displayName(selectedMesh);
  highlightLayer.removeMesh(selectedMesh);
  gizmoManager.attachToMesh(null);
  selectedMesh.dispose(false, true);
  selectedMesh = null;
  selectMesh(nextSelection);
  refreshSceneList();
  setStatus(`${deletedName} deleted`);
}

function resetCamera() {
  camera.setTarget(new BABYLON.Vector3(0, 1.1, 0));
  camera.alpha = -Math.PI / 2.35;
  camera.beta = Math.PI / 2.85;
  camera.radius = 12;
  setStatus("Camera reset");
}

function toggleSnap() {
  snapEnabled = !snapEnabled;
  document.querySelector("[data-toggle-snap]")?.classList.toggle("is-active", snapEnabled);
  configureSnap();
  setStatus(snapEnabled ? "Snap enabled" : "Snap disabled");
}

function toggleGrid() {
  gridVisible = !gridVisible;
  grid.setEnabled(gridVisible);
  document.querySelector("[data-toggle-grid]")?.classList.toggle("is-active", gridVisible);
  setStatus(gridVisible ? "Grid enabled" : "Grid disabled");
}

function toggleProfiler(open = !profilerOpen) {
  profilerOpen = Boolean(open);
  profilerPanel.hidden = !profilerOpen;
  document.querySelector("[data-toggle-profiler]")?.classList.toggle("is-active", profilerOpen);
  setStatus(profilerOpen ? "Profiler enabled" : "Profiler disabled");
}

function updateProfiler() {
  if (!profilerOpen) return;
  const activeCount = scene.getActiveMeshes().length;
  profilerEls.fps.textContent = Math.round(engine.getFps()).toString();
  profilerEls.meshes.textContent = scene.meshes.length.toString();
  profilerEls.active.textContent = activeCount.toString();
  profilerEls.materials.textContent = scene.materials.length.toString();
}

scene.onPointerObservable.add((pointerInfo) => {
  if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
  if (gizmoManager.isHovered || gizmoManager.isDragging) return;
  const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh.metadata?.editable === true);
  if (pick?.hit && pick.pickedMesh) selectMesh(pick.pickedMesh);
});

transformInputs.forEach((input) => {
  input.addEventListener("change", () => applyPropertyInput(input));
  input.addEventListener("blur", () => updatePropertyInputsFromMesh());
});

colorInput.addEventListener("input", () => {
  if (!selectedMesh?.material) return;
  const color = hexToColor(colorInput.value);
  selectedMesh.material.diffuseColor = color;
  applyMaterialSurface(selectedMesh.material, materialTypeSelect.value, color);
  setStatus(`${displayName(selectedMesh)} color updated`);
});

materialTypeSelect.addEventListener("change", () => {
  if (!selectedMesh?.material) return;
  applyMaterialSurface(selectedMesh.material, materialTypeSelect.value, selectedMesh.material.diffuseColor || BABYLON.Color3.White());
  setStatus(`${displayName(selectedMesh)} material updated`);
});

sceneListEl.addEventListener("click", (event) => {
  const item = event.target.closest("[data-mesh-id]");
  if (!item) return;
  const mesh = findEditableMeshes().find((entry) => String(entry.uniqueId) === item.dataset.meshId);
  selectMesh(mesh || null);
});

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll("[data-tool-shortcut]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.toolShortcut)));
document.querySelector("[data-add-box]")?.addEventListener("click", addBox);
document.querySelector("[data-add-sphere]")?.addEventListener("click", addSphere);
document.querySelector("[data-delete-selected]")?.addEventListener("click", deleteSelected);
document.querySelector("[data-reset-camera]")?.addEventListener("click", resetCamera);
document.querySelector("[data-toggle-snap]")?.addEventListener("click", toggleSnap);
document.querySelector("[data-toggle-grid]")?.addEventListener("click", toggleGrid);
document.querySelector("[data-toggle-profiler]")?.addEventListener("click", () => toggleProfiler());
document.querySelector("[data-close-profiler]")?.addEventListener("click", () => toggleProfiler(false));
document.querySelector("[data-logout]")?.addEventListener("click", () => {
  localStorage.removeItem(config.sessionKey || "bloxlab.session");
  window.location.href = "./login.html";
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const key = event.key.toLowerCase();
  if (key === "q") setTool("select");
  if (key === "w") setTool("move");
  if (key === "e") setTool("rotate");
  if (key === "r") setTool("scale");
  if (key === "delete" || key === "backspace") deleteSelected();
});

engine.runRenderLoop(() => {
  scene.render();
  fpsEl.textContent = Math.round(engine.getFps()).toString();
  updatePropertyInputsFromMesh();
  updateProfiler();
});

window.addEventListener("resize", () => engine.resize());
refreshSceneList();
refreshSelectionUi();
refreshIcons();
setStatus("Scene ready");
