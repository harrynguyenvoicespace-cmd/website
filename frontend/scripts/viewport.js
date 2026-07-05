const session = localStorage.getItem("bloxlab.session");
const canvas = document.getElementById("studioCanvas");
const fpsEl = document.querySelector("[data-fps]");
const countEl = document.querySelector("[data-object-count]");
const logoutButton = document.querySelector("[data-logout]");
const resetButton = document.querySelector("[data-reset-camera]");
const addBlockButton = document.querySelector("[data-add-block]");
const fileInput = document.querySelector("[data-ai-file]");
const fileName = document.querySelector("[data-file-name]");
const promptInput = document.querySelector("[data-prompt]");
const statusEl = document.querySelector("[data-ai-status]");
const privacyButton = document.querySelector("[data-privacy]");
const privacyLabel = document.querySelector("[data-privacy-label]");
const generateButton = document.querySelector("[data-generate-model]");
const generateImageButton = document.querySelector("[data-generate-image]");
const modeButtons = document.querySelectorAll("[data-mode]");
const sourceButtons = document.querySelectorAll("[data-source-tab]");
const railButtons = document.querySelectorAll("[data-rail-tool]");

if (!session) {
  window.location.href = "./login.html";
}

if (!window.BABYLON) {
  document.body.innerHTML = "<main class='studio-shell'><section class='viewport-panel'><header class='viewport-header'><h1>BabylonJS failed to load</h1></header></section></main>";
  throw new Error("BabylonJS CDN did not load.");
}

const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  antialias: true
});

let objectCount = 3;
let privacy = "Public";

function createMaterial(scene, name, color, roughness = 0.48) {
  const material = new BABYLON.PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = 0.08;
  return material;
}

function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.03, 0.035, 0.05, 1);

  const camera = new BABYLON.ArcRotateCamera(
    "main-camera",
    Math.PI / 4,
    Math.PI / 3,
    10,
    new BABYLON.Vector3(0, 1.2, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 34;
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 18;

  const hemi = new BABYLON.HemisphericLight("sky-light", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.72;

  const point = new BABYLON.PointLight("accent-light", new BABYLON.Vector3(-3, 5, -4), scene);
  point.diffuse = new BABYLON.Color3(0.3, 0.95, 1);
  point.intensity = 1.2;

  const ground = BABYLON.MeshBuilder.CreateGround("grid-floor", { width: 14, height: 14 }, scene);
  const cyan = createMaterial(scene, "cyan-block", new BABYLON.Color3(0.15, 0.82, 0.86));
  const lime = createMaterial(scene, "lime-block", new BABYLON.Color3(0.74, 0.92, 0.35));
  const coral = createMaterial(scene, "coral-block", new BABYLON.Color3(0.95, 0.42, 0.32));

  const tower = BABYLON.MeshBuilder.CreateBox("tower", { width: 1.4, height: 2.8, depth: 1.4 }, scene);
  tower.position = new BABYLON.Vector3(-1.8, 1.4, 0);
  tower.material = cyan;

  const bridge = BABYLON.MeshBuilder.CreateBox("bridge", { width: 3.2, height: 0.55, depth: 1.1 }, scene);
  bridge.position = new BABYLON.Vector3(1.2, 1.2, 0.2);
  bridge.rotation.y = 0.24;
  bridge.material = lime;

  const crystal = BABYLON.MeshBuilder.CreatePolyhedron("crystal", { type: 1, size: 1.25 }, scene);
  crystal.position = new BABYLON.Vector3(0.6, 2.4, -1.7);
  crystal.material = coral;

  const grid = new BABYLON.GridMaterial("studio-grid", scene);
  grid.majorUnitFrequency = 4;
  grid.minorUnitVisibility = 0.35;
  grid.gridRatio = 0.5;
  grid.backFaceCulling = false;
  grid.mainColor = new BABYLON.Color3(0.34, 0.36, 0.42);
  grid.lineColor = new BABYLON.Color3(0.16, 0.18, 0.23);
  grid.opacity = 0.92;
  ground.material = grid;

  scene.onBeforeRenderObservable.add(() => {
    crystal.rotation.y += 0.01;
  });

  return { scene, camera, materials: [cyan, lime, coral] };
}

function addGeneratedPreview() {
  const mesh = BABYLON.MeshBuilder.CreateTorusKnot(`ai-model-${objectCount + 1}`, {
    radius: 0.78,
    tube: 0.22,
    radialSegments: 96,
    tubularSegments: 16
  }, studio.scene);
  mesh.position = new BABYLON.Vector3(Math.sin(objectCount) * 2.4, 1.2, Math.cos(objectCount) * 2.4);
  mesh.material = studio.materials[objectCount % studio.materials.length];
  objectCount += 1;
  countEl.textContent = String(objectCount);
}

const studio = createScene();

engine.runRenderLoop(() => {
  studio.scene.render();
  fpsEl.textContent = Math.round(engine.getFps()).toString();
});

window.addEventListener("resize", () => engine.resize());

resetButton.addEventListener("click", () => {
  studio.camera.setPosition(new BABYLON.Vector3(5, 5, -7));
  studio.camera.setTarget(new BABYLON.Vector3(0, 1.2, 0));
});

addBlockButton.addEventListener("click", () => {
  const block = BABYLON.MeshBuilder.CreateBox(`block-${objectCount + 1}`, { size: 0.85 }, studio.scene);
  block.position = new BABYLON.Vector3(
    Math.sin(objectCount) * 2.8,
    0.45,
    Math.cos(objectCount) * 2.8
  );
  block.material = studio.materials[objectCount % studio.materials.length];
  objectCount += 1;
  countEl.textContent = String(objectCount);
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    modeButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    statusEl.textContent = button.dataset.mode === "smart" ? "Smart Mesh selected" : "HD Model selected";
  });
});

sourceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sourceButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    statusEl.textContent = `${button.dataset.sourceTab} source ready`;
  });
});

railButtons.forEach((button) => {
  button.addEventListener("click", () => {
    railButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    statusEl.textContent = `${button.dataset.railTool} module selected`;
  });
});

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName.textContent = file.name;
  statusEl.textContent = `${file.name} loaded for AI tuning`;
});

privacyButton?.addEventListener("click", () => {
  privacy = privacy === "Public" ? "Private" : "Public";
  privacyLabel.textContent = privacy;
  statusEl.textContent = `Privacy set to ${privacy}`;
});

generateImageButton?.addEventListener("click", (event) => {
  event.preventDefault();
  statusEl.textContent = "Image-to-3D prompt prepared";
  promptInput.focus();
});

generateButton?.addEventListener("click", () => {
  const prompt = promptInput.value.trim() || "stylized 3D game asset";
  statusEl.textContent = `Generated preview: ${prompt}`;
  addGeneratedPreview();
});

logoutButton?.addEventListener("click", () => {
  localStorage.removeItem("bloxlab.session");
  window.location.href = "./login.html";
});