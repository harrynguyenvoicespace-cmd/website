const session = localStorage.getItem("bloxlab.session");
const canvas = document.getElementById("studioCanvas");
const fpsEl = document.querySelector("[data-fps]");
const countEl = document.querySelector("[data-object-count]");
const currentModeEl = document.querySelector("[data-current-mode]");
const logoutButton = document.querySelector("[data-logout]");
const resetButton = document.querySelector("[data-reset-camera]");
const addBlockButton = document.querySelector("[data-add-block]");
const uploadZone = document.querySelector("[data-upload-zone]");
const fileInput = document.querySelector("[data-ai-file]");
const fileName = document.querySelector("[data-file-name]");
const promptInput = document.querySelector("[data-prompt]");
const statusEl = document.querySelector("[data-ai-status]");
const privacyButton = document.querySelector("[data-privacy]");
const privacyLabel = document.querySelector("[data-privacy-label]");
const memberButton = document.querySelector("[data-member]");
const memberLabel = document.querySelector("[data-member-label]");
const generateButton = document.querySelector("[data-generate-model]");
const generateImageButton = document.querySelector("[data-generate-image]");
const modeButtons = document.querySelectorAll("[data-mode]");
const sourceButtons = document.querySelectorAll("[data-source-tab]");
const railButtons = document.querySelectorAll("[data-rail-tool]");
const topologyDetails = document.querySelector("[data-topology-details]");
const topologyLabel = document.querySelector("[data-topology-label]");
const faceLimitInput = document.querySelector("[data-face-limit]");
const textureSelect = document.querySelector("[data-texture]");
const qualitySelect = document.querySelector("[data-quality]");

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
let currentMode = "Smart";
let currentSource = "image";
let membersOnly = true;
let animateScene = true;
let textureIndex = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function createMaterial(scene, name, color, roughness = 0.48) {
  const material = new BABYLON.PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = 0.05;
  return material;
}

function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.94, 0.97, 1, 1);

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
  hemi.intensity = 0.92;
  hemi.groundColor = new BABYLON.Color3(0.78, 0.85, 0.9);

  const point = new BABYLON.PointLight("accent-light", new BABYLON.Vector3(-3, 5, -4), scene);
  point.diffuse = new BABYLON.Color3(0.18, 0.66, 0.64);
  point.intensity = 0.86;

  const ground = BABYLON.MeshBuilder.CreateGround("grid-floor", { width: 14, height: 14 }, scene);
  const cyan = createMaterial(scene, "cyan-block", new BABYLON.Color3(0.18, 0.74, 0.72));
  const lime = createMaterial(scene, "lime-block", new BABYLON.Color3(0.74, 0.86, 0.36));
  const coral = createMaterial(scene, "coral-block", new BABYLON.Color3(0.94, 0.58, 0.48));
  const violet = createMaterial(scene, "violet-model", new BABYLON.Color3(0.46, 0.38, 0.9));

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
  grid.minorUnitVisibility = 0.38;
  grid.gridRatio = 0.5;
  grid.backFaceCulling = false;
  grid.mainColor = new BABYLON.Color3(0.75, 0.82, 0.88);
  grid.lineColor = new BABYLON.Color3(0.46, 0.55, 0.66);
  grid.opacity = 0.78;
  ground.material = grid;

  scene.onBeforeRenderObservable.add(() => {
    if (animateScene) {
      crystal.rotation.y += 0.01;
    }
  });

  return { scene, camera, materials: [cyan, lime, coral, violet], ground, featured: [tower, bridge, crystal] };
}

function refreshObjectCount() {
  countEl.textContent = String(objectCount);
}

function resetCamera() {
  studio.camera.setPosition(new BABYLON.Vector3(5, 5, -7));
  studio.camera.setTarget(new BABYLON.Vector3(0, 1.2, 0));
  setStatus("Camera reset");
}

function addBlock() {
  const block = BABYLON.MeshBuilder.CreateBox(`block-${objectCount + 1}`, { size: 0.85 }, studio.scene);
  block.position = new BABYLON.Vector3(
    Math.sin(objectCount) * 2.8,
    0.45,
    Math.cos(objectCount) * 2.8
  );
  block.material = studio.materials[objectCount % studio.materials.length];
  objectCount += 1;
  refreshObjectCount();
  setStatus("Block added to viewport");
}

function addGeneratedPreview() {
  const mesh = currentMode === "HD"
    ? BABYLON.MeshBuilder.CreateTorusKnot(`ai-model-${objectCount + 1}`, { radius: 0.78, tube: 0.22, radialSegments: 96, tubularSegments: 16 }, studio.scene)
    : BABYLON.MeshBuilder.CreatePolyhedron(`ai-model-${objectCount + 1}`, { type: 2, size: 1.35 }, studio.scene);
  mesh.position = new BABYLON.Vector3(Math.sin(objectCount) * 2.4, 1.2, Math.cos(objectCount) * 2.4);
  mesh.material = studio.materials[objectCount % studio.materials.length];
  objectCount += 1;
  refreshObjectCount();
}

function applyTextureCycle() {
  const palettes = [
    [new BABYLON.Color3(0.18, 0.74, 0.72), new BABYLON.Color3(0.74, 0.86, 0.36), new BABYLON.Color3(0.94, 0.58, 0.48)],
    [new BABYLON.Color3(0.45, 0.35, 0.9), new BABYLON.Color3(0.98, 0.75, 0.24), new BABYLON.Color3(0.2, 0.7, 0.92)],
    [new BABYLON.Color3(0.9, 0.42, 0.54), new BABYLON.Color3(0.35, 0.78, 0.55), new BABYLON.Color3(0.32, 0.46, 0.86)]
  ];
  textureIndex = (textureIndex + 1) % palettes.length;
  studio.featured.forEach((mesh, index) => {
    mesh.material.albedoColor = palettes[textureIndex][index % palettes[textureIndex].length];
  });
  setStatus("Texture palette applied");
}

function toggleSegments(enabled) {
  studio.featured.forEach((mesh) => {
    if (enabled) {
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 2;
      mesh.edgesColor = new BABYLON.Color4(0.08, 0.43, 0.42, 1);
    } else if (mesh.disableEdgesRendering) {
      mesh.disableEdgesRendering();
    }
  });
}

function applyRetopo() {
  studio.featured.forEach((mesh) => {
    mesh.scaling.y = Math.max(0.78, mesh.scaling.y * 0.92);
    mesh.rotation.y += 0.08;
  });
  setStatus("Retopo preview applied");
}

function showUploadedImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const texture = new BABYLON.Texture(reader.result, studio.scene);
    const plane = BABYLON.MeshBuilder.CreatePlane(`upload-preview-${objectCount + 1}`, { width: 2.1, height: 2.1 }, studio.scene);
    plane.position = new BABYLON.Vector3(-2.8, 1.8, -2.2);
    plane.rotation.y = Math.PI / 5;
    const material = new BABYLON.StandardMaterial(`upload-material-${objectCount + 1}`, studio.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.18);
    plane.material = material;
    objectCount += 1;
    refreshObjectCount();
    setStatus(`${file.name} added as image reference`);
  };
  reader.readAsDataURL(file);
}

const studio = createScene();
resetCamera();
setStatus("Ready");

engine.runRenderLoop(() => {
  studio.scene.render();
  fpsEl.textContent = Math.round(engine.getFps()).toString();
});

window.addEventListener("resize", () => engine.resize());

resetButton.addEventListener("click", resetCamera);
addBlockButton.addEventListener("click", addBlock);

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    modeButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentMode = button.dataset.mode === "smart" ? "Smart" : "HD";
    currentModeEl.textContent = currentMode;
    setStatus(`${currentMode} model mode selected`);
  });
});

sourceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sourceButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentSource = button.dataset.sourceTab;
    const placeholders = {
      image: "describe the uploaded reference as a clean game asset",
      model: "optimize this model into a Roblox-ready mesh",
      multi: "combine front, side, and detail views into one model",
      prompt: "robotic game prop, clean topology, stylized material"
    };
    promptInput.placeholder = placeholders[currentSource] || placeholders.prompt;
    setStatus(`${currentSource} source ready`);
    if (currentSource === "image") fileInput.focus();
  });
});

railButtons.forEach((button) => {
  button.addEventListener("click", () => {
    railButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const tool = button.dataset.railTool;
    if (tool === "image") {
      fileInput.click();
      setStatus("Choose an image reference");
    } else if (tool === "segment") {
      toggleSegments(true);
      setStatus("Segment edges visible");
    } else if (tool === "retopo") {
      applyRetopo();
    } else if (tool === "texture") {
      applyTextureCycle();
    } else if (tool === "animate") {
      animateScene = !animateScene;
      setStatus(animateScene ? "Animation enabled" : "Animation paused");
    } else {
      toggleSegments(false);
      setStatus("Model module selected");
    }
  });
});

uploadZone?.addEventListener("click", () => fileInput.click());
uploadZone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName.textContent = file.name;
  if (file.size > 20 * 1024 * 1024) {
    setStatus("File is over 20MB");
    return;
  }
  showUploadedImage(file);
});

privacyButton?.addEventListener("click", () => {
  privacy = privacy === "Public" ? "Private" : "Public";
  privacyLabel.textContent = privacy;
  setStatus(`Privacy set to ${privacy}`);
});

memberButton?.addEventListener("click", () => {
  membersOnly = !membersOnly;
  memberLabel.textContent = membersOnly ? "Trial active" : "Open access";
  setStatus(membersOnly ? "Members trial enabled" : "Members lock disabled");
});

generateImageButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  promptInput.value = promptInput.value.trim() || "bright stylized 3D prop with clean topology";
  addGeneratedPreview();
  setStatus("Image-for-3D preview generated");
});

function updateTopologyStatus() {
  const faces = Number(faceLimitInput.value || 0).toLocaleString();
  topologyLabel.textContent = `${qualitySelect.value} / ${textureSelect.value}`;
  setStatus(`Topology set: ${faces} faces, ${textureSelect.value}, ${qualitySelect.value}`);
}

faceLimitInput?.addEventListener("input", updateTopologyStatus);
textureSelect?.addEventListener("change", updateTopologyStatus);
qualitySelect?.addEventListener("change", updateTopologyStatus);
topologyDetails?.addEventListener("toggle", () => {
  setStatus(topologyDetails.open ? "Topology settings opened" : "Topology settings closed");
});

generateButton?.addEventListener("click", () => {
  const prompt = promptInput.value.trim() || "stylized 3D game asset";
  addGeneratedPreview();
  setStatus(`Generated ${currentMode} preview from ${currentSource}: ${prompt}`);
});

logoutButton?.addEventListener("click", () => {
  localStorage.removeItem("bloxlab.session");
  window.location.href = "./login.html";
});