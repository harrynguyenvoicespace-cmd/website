const session = localStorage.getItem("bloxlab.session");
const canvas = document.getElementById("studioCanvas");
const fpsEl = document.querySelector("[data-fps]");
const countEl = document.querySelector("[data-object-count]");
const logoutButton = document.querySelector("[data-logout]");
const resetButton = document.querySelector("[data-reset-camera]");
const addBlockButton = document.querySelector("[data-add-block]");

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
  ground.material = createMaterial(scene, "floor-material", new BABYLON.Color3(0.07, 0.08, 0.11), 0.82);

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

logoutButton?.addEventListener("click", () => {
  localStorage.removeItem("bloxlab.session");
  window.location.href = "./login.html";
});
