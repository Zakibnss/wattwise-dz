"use client";

/**
 * Building3D — native Three.js interactive Smart Building Digital Twin.
 *
 * Replaces the previous React-Three-Fiber implementation with a direct
 * Three.js scene so we have full control over geometry, materials, lighting,
 * raycasting, camera presets, floor filtering and exploded view.
 *
 * The parent page (Building.tsx) keeps owning the equipment side panel and the
 * zone list; this component only renders the 3D canvas + its own control
 * overlay and reports zone selection through onSelectZone.
 */

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { cn } from "@/components/ui/Button";
import type { Floor, Zone } from "@/lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UNIT = 1.4;
const ZONE_HEIGHT = 0.9;
const WALL_THICKNESS = 0.05;
const FLOOR_SLAB_HEIGHT = 0.12;
const FLOOR_PITCH = ZONE_HEIGHT + 0.5;
const PLAN_COLS = 4;
const PLAN_ROWS = 2;
const EXPLODED_SEPARATION = 3.2;

const STATUS_COLORS_STR: Record<string, string> = {
  online: "#10B981",
  warning: "#F59E0B",
  alert: "#EF4444",
  offline: "#94A3B8",
};

const STATUS_COLORS_NUM: Record<string, number> = {
  online: 0x10b981,
  warning: 0xf59e0b,
  alert: 0xef4444,
  offline: 0x94a3b8,
};

export const STATUS_COLORS = STATUS_COLORS_STR;

export function zoneStatus3D(zone: Zone): string {
  if (zone.equipment.some((eq) => eq.status === "alert")) return "alert";
  if (zone.equipment.some((eq) => eq.status === "warning")) return "warning";
  if (zone.equipment.length > 0 && zone.equipment.every((eq) => eq.status === "offline")) return "offline";
  return "online";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexColor(s: string): number {
  return parseInt(s.replace("#", ""), 16);
}

function makeMaterial(color: number, opacity = 1, transparent = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent,
    opacity,
    metalness: 0.15,
    roughness: 0.45,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function Building3D({
  floors,
  selectedZoneId,
  onSelectZone,
  onSelectEquipment,
  className,
}: {
  floors: Floor[];
  selectedZoneId: number | null;
  onSelectZone: (zoneId: number) => void;
  onSelectEquipment?: (equipmentId: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [floorFilter, setFloorFilter] = useState<"all" | number>("all");
  const [exploded, setExploded] = useState(false);
  const [view, setView] = useState<"perspective" | "top" | "front" | "side">("perspective");
  const [vizMode, setVizMode] = useState<"status" | "equipment" | "sensor" | "consumption">("status");
  const [inspectionMode, setInspectionMode] = useState(false);

  // Refs shared with the three.js lifecycle (avoid stale closures).
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    labelRenderer: CSS2DRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    roomMeshes: { mesh: THREE.Object3D; zoneId: number }[];
    floorGroups: THREE.Group[];
    raf: number;
    resizeObserver: ResizeObserver | null;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    hoveredZoneId: number | null;
    targetCameraPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    animating: boolean;
    exploded: boolean;
    floorFilter: "all" | number;
  }>({
    renderer: null,
    labelRenderer: null,
    scene: null,
    camera: null,
    controls: null,
    roomMeshes: [],
    floorGroups: [],
    raf: 0,
    resizeObserver: null,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    hoveredZoneId: null,
    targetCameraPos: new THREE.Vector3(12, 10, 12),
    targetLookAt: new THREE.Vector3(0, 1.5, 0),
    animating: false,
    exploded: false,
    floorFilter: "all",
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const S = stateRef.current;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    container.appendChild(labelRenderer.domElement);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 18, 40);

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      200,
    );
    camera.position.set(12, 10, 12);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 40;
    controls.minPolarAngle = Math.PI / 8;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.target.set(0, 1.5, 0);

    // ---- Lights ----
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(8, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rim.position.set(-8, 6, -6);
    scene.add(rim);
    const point = new THREE.PointLight(0x8b5cf6, 0.4, 40);
    point.position.set(0, 8, 0);
    scene.add(point);

    // ---- Ground ----
    const groundGeo = new THREE.CylinderGeometry(8.5, 8.5, 0.25, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111c31, metalness: 0.4, roughness: 0.6 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    scene.add(ground);
    const ringGeo = new THREE.RingGeometry(8.5, 8.65, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.27;
    scene.add(ring);

    // ---- Building groups ----
    const totalHeight = floors.length * FLOOR_PITCH;
    const roomMeshes: { mesh: THREE.Object3D; zoneId: number }[] = [];
    const floorGroups: THREE.Group[] = [];

    floors.forEach((floor, idx) => {
      const group = new THREE.Group();
      group.name = `Floor-${floor.id}`;
      const baseY = idx * FLOOR_PITCH;
      group.position.y = baseY;
      floorGroups.push(group);

      // Slab
      const slabW = PLAN_COLS * UNIT + 0.6;
      const slabD = PLAN_ROWS * UNIT + 0.6;
      const slabGeo = new THREE.BoxGeometry(slabW, FLOOR_SLAB_HEIGHT, slabD);
      const slabMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.35, roughness: 0.5 });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.y = -ZONE_HEIGHT / 2 - FLOOR_SLAB_HEIGHT / 2 - 0.03;
      slab.receiveShadow = true;
      slab.castShadow = true;
      group.add(slab);
      const slabEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(slabGeo),
        new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.9 }),
      );
      slabEdges.position.copy(slab.position);
      group.add(slabEdges);

      // Floor label
      const labelDiv = document.createElement("div");
      labelDiv.className = "r3f-floor-label";
      labelDiv.textContent = floor.name.toUpperCase();
      labelDiv.style.cssText =
        "color:#64748b;font-size:11px;font-weight:600;letter-spacing:0.08em;text-shadow:0 0 4px #0f172a;pointer-events:none;";
      const floorLabel = new CSS2DObject(labelDiv);
      floorLabel.position.set(-slabW / 2 + 0.2, -ZONE_HEIGHT / 2 - 0.32, slabD / 2 - 0.1);
      group.add(floorLabel);

      floor.zones.forEach((zone) => {
        const status = zoneStatus3D(zone);
        const color = STATUS_COLORS_NUM[status] ?? 0x94a3b8;
        const width = Math.max(zone.plan_w * UNIT - 0.18, 0.6);
        const depth = Math.max(zone.plan_h * UNIT - 0.18, 0.6);
        const x = (zone.plan_x + zone.plan_w / 2) * UNIT - (PLAN_COLS * UNIT) / 2;
        const z = (zone.plan_y + zone.plan_h / 2) * UNIT - (PLAN_ROWS * UNIT) / 2;

        const roomGroup = new THREE.Group();
        roomGroup.name = `Zone-${zone.id}`;
        roomGroup.position.set(x, 0, z);
        roomGroup.userData = { zoneId: zone.id, zone };

        // Floor plate
        const plateGeo = new THREE.BoxGeometry(width + 0.06, 0.05, depth + 0.06);
        const plateMat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.9,
          metalness: 0.1,
          roughness: 0.4,
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = -ZONE_HEIGHT / 2 + 0.025;
        plate.receiveShadow = true;
        plate.castShadow = true;
        plate.userData = { zoneId: zone.id, kind: "room", status };
        roomGroup.add(plate);
        roomMeshes.push({ mesh: plate, zoneId: zone.id });

        // Walls (4 segments) - glass-like
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.18,
          metalness: 0.1,
          roughness: 0.2,
          emissive: color,
          emissiveIntensity: 0.08,
        });
        const halfH = ZONE_HEIGHT / 2;
        // front
        const wFront = new THREE.Mesh(new THREE.BoxGeometry(width, ZONE_HEIGHT, WALL_THICKNESS), wallMat);
        wFront.position.set(0, 0, depth / 2);
        // back
        const wBack = new THREE.Mesh(new THREE.BoxGeometry(width, ZONE_HEIGHT, WALL_THICKNESS), wallMat);
        wBack.position.set(0, 0, -depth / 2);
        // left
        const wLeft = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, ZONE_HEIGHT, depth), wallMat);
        wLeft.position.set(-width / 2, 0, 0);
        // right
        const wRight = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, ZONE_HEIGHT, depth), wallMat);
        wRight.position.set(width / 2, 0, 0);
        [wFront, wBack, wLeft, wRight].forEach((w) => {
          w.castShadow = true;
          w.userData = { zoneId: zone.id, kind: "room", status };
          roomGroup.add(w);
          roomMeshes.push({ mesh: w, zoneId: zone.id });
        });

        // Wall edges (blueprint outline)
        const wallEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, ZONE_HEIGHT, depth));
        const wallEdges = new THREE.LineSegments(
          wallEdgesGeo,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
        );
        wallEdges.position.y = 0;
        roomGroup.add(wallEdges);

        // Equipment markers
        const eqCount = zone.equipment.length;
        zone.equipment.forEach((eq, ei) => {
          const eqColor =
            eq.status === "alert" ? 0xef4444 : eq.status === "warning" ? 0xf59e0b : eq.status === "offline" ? 0x94a3b8 : 0x38bdf8;
          const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12);
          const mat = new THREE.MeshStandardMaterial({ color: eqColor, emissive: eqColor, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.4 });
          const mesh = new THREE.Mesh(geo, mat);
          const cols = Math.max(1, Math.ceil(Math.sqrt(eqCount)));
          const row = Math.floor(ei / cols);
          const col = ei % cols;
          const sx = -width / 2 + 0.35 + col * 0.5;
          const sz = -depth / 2 + 0.35 + row * 0.5;
          mesh.position.set(sx, -ZONE_HEIGHT / 2 + 0.14, sz);
          mesh.castShadow = true;
          mesh.userData = { zoneId: zone.id, equipmentId: eq.id, kind: "equipment", status: eq.status };
          roomGroup.add(mesh);
          roomMeshes.push({ mesh, zoneId: zone.id });

          // Equipment label
          const eqDiv = document.createElement("div");
          eqDiv.textContent = eq.name;
          eqDiv.style.cssText =
            "color:#e2e8f0;font-size:9px;background:rgba(15,23,42,0.75);padding:1px 4px;border-radius:3px;pointer-events:none;white-space:nowrap;";
          const eqLabel = new CSS2DObject(eqDiv);
          eqLabel.position.set(sx, -ZONE_HEIGHT / 2 + 0.45, sz);
          roomGroup.add(eqLabel);
        });

        // Room label
        const roomDiv = document.createElement("div");
        roomDiv.textContent = zone.name;
        roomDiv.style.cssText =
          "color:#f1f5f9;font-size:12px;font-weight:700;text-shadow:0 0 6px #0f172a;pointer-events:none;white-space:nowrap;";
        const roomLabel = new CSS2DObject(roomDiv);
        roomLabel.position.set(0, ZONE_HEIGHT / 2 + 0.35, 0);
        roomGroup.add(roomLabel);

        // Status sub-label
        const statusDiv = document.createElement("div");
        const statusText = status === "online" ? "OK" : status === "warning" ? "Attention" : status === "alert" ? "Alerte" : "Hors ligne";
        statusDiv.textContent = statusText;
        statusDiv.style.cssText = `color:${"#" + color.toString(16).padStart(6, "0")};font-size:9px;font-weight:600;pointer-events:none;`;
        const statusLabel = new CSS2DObject(statusDiv);
        statusLabel.position.set(0, ZONE_HEIGHT / 2 + 0.18, 0);
        roomGroup.add(statusLabel);

        group.add(roomGroup);
      });

      scene.add(group);
    });

    S.renderer = renderer;
    S.labelRenderer = labelRenderer;
    S.scene = scene;
    S.camera = camera;
    S.controls = controls;
    S.roomMeshes = roomMeshes;
    S.floorGroups = floorGroups;

    // ---- Camera animation target ----
    const animateCamera = () => {
      if (!S.animating) return;
      camera.position.lerp(S.targetCameraPos, 0.08);
      controls.target.lerp(S.targetLookAt, 0.08);
      if (camera.position.distanceTo(S.targetCameraPos) < 0.05) {
        S.animating = false;
      }
    };

    const flyTo = (pos: THREE.Vector3, look: THREE.Vector3) => {
      S.targetCameraPos.copy(pos);
      S.targetLookAt.copy(look);
      S.animating = true;
    };

    // ---- Hover / click via raycaster ----
    const onPointerMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      S.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      S.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      S.raycaster.setFromCamera(S.pointer, camera);
      const intersects = S.raycaster.intersectObjects(
        roomMeshes.map((r) => r.mesh),
        false,
      );
      let newHover: number | null = null;
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        newHover = (obj.userData.zoneId as number) ?? null;
      }
      if (newHover !== S.hoveredZoneId) {
        // reset previous
        roomMeshes.forEach((r) => {
          const m = r.mesh as THREE.Mesh;
          if (m.material && (m.material as THREE.MeshStandardMaterial).emissiveIntensity !== undefined) {
            const base = r.zoneId === selectedZoneId ? 0.6 : 0.25;
            (m.material as THREE.MeshStandardMaterial).emissiveIntensity = r.zoneId === newHover ? base + 0.35 : base;
          }
        });
        S.hoveredZoneId = newHover;
        renderer.domElement.style.cursor = newHover !== null ? "pointer" : "grab";
      }
    };

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      S.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      S.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      S.raycaster.setFromCamera(S.pointer, camera);
      const intersects = S.raycaster.intersectObjects(roomMeshes.map((r) => r.mesh), false);
      if (intersects.length > 0) {
        const ud = intersects[0].object.userData || {};
        const zoneId = ud.zoneId as number;
        if (ud.kind === "equipment" && ud.equipmentId && onSelectEquipment) {
          onSelectEquipment(ud.equipmentId as number);
        }
        if (zoneId) onSelectZone(zoneId);
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    // ---- Resize ----
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    S.resizeObserver = ro;
    window.addEventListener("resize", handleResize);

    // ---- Exploded / floor filter application ----
    const applyFloorState = () => {
      floorGroups.forEach((g, idx) => {
        const visible = S.floorFilter === "all" || S.floorFilter === idx;
        g.visible = true;
        const targetY = S.exploded
          ? idx * EXPLODED_SEPARATION
          : idx * FLOOR_PITCH;
        // animate
        const startY = g.position.y;
        const duration = 600;
        const t0 = performance.now();
        const step = () => {
          const now = performance.now();
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          g.position.y = startY + (targetY - startY) * eased;
          g.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m && m.opacity !== undefined && (o as THREE.Mesh).geometry) {
              // reduce opacity for non-selected floors
              if (S.floorFilter !== "all" && S.floorFilter !== idx) {
                m.transparent = true;
                m.opacity = 0.18;
              }
            }
          });
          if (p < 1) requestAnimationFrame(step);
        };
        step();

        // opacity handling for non-selected floors
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat.opacity !== undefined) {
              if (S.floorFilter !== "all" && S.floorFilter !== idx) {
                mat.transparent = true;
                mat.opacity = Math.min(mat.opacity, 0.18);
              }
            }
          }
        });
        // visibility of whole floor group when filtering? keep visible but dimmed
        g.visible = true;
      });
    };

    // Expose apply via ref by storing on S
    (S as any).applyFloorState = applyFloorState;

    // ---- Animation loop ----
    const clock = new THREE.Clock();
    const loop = () => {
      S.raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      // pulse alert rooms
      roomMeshes.forEach((r) => {
        const m = r.mesh as THREE.Mesh;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!mat || mat.emissiveIntensity === undefined) return;
        const zone = floors.flatMap((f) => f.zones).find((z) => z.id === r.zoneId);
        const st = zone ? zoneStatus3D(zone) : "online";
        if (st === "alert") {
          mat.emissiveIntensity = 0.4 + 0.4 * Math.sin(t * 3.2);
        }
      });
      animateCamera();
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    loop();

    // Initial floor state
    applyFloorState();

    // Store flyTo for external view presets
    (S as any).flyTo = flyTo;

    // Cleanup
    return () => {
      cancelAnimationFrame(S.raf);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      // dispose geometries/materials
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else (mesh.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      if (container.contains(labelRenderer.domElement)) container.removeChild(labelRenderer.domElement);
      S.renderer = null;
      S.labelRenderer = null;
      S.scene = null;
      S.camera = null;
      S.controls = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors]);

  // Sync selected zone -> highlight + camera focus
  useEffect(() => {
    const S = stateRef.current;
    if (!S.roomMeshes || S.roomMeshes.length === 0) return;
    // highlight
    S.roomMeshes.forEach((r) => {
      const m = r.mesh as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = r.zoneId === selectedZoneId ? 0.7 : 0.25;
      }
    });
    if (selectedZoneId != null && S.scene) {
      // find room position
      let target: THREE.Vector3 | null = null;
      S.scene.traverse((o) => {
        if (o.userData && o.userData.zoneId === selectedZoneId && o.type === "Group") {
          const wp = new THREE.Vector3();
          o.getWorldPosition(wp);
          target = wp;
        }
      });
      if (target && (S as any).flyTo) {
        const t = target as THREE.Vector3;
        (S as any).flyTo(new THREE.Vector3(t.x + 4, t.y + 4, t.z + 4), t);
      }
    }
  }, [selectedZoneId]);

  // Visualization mode -> recolor rooms/equipment without rebuilding the scene.
  useEffect(() => {
    const S = stateRef.current;
    if (!S.roomMeshes || S.roomMeshes.length === 0) return;
    const zones = floors.flatMap((f) => f.zones);
    const maxPower = Math.max(
      1,
      ...zones.map((z) => z.equipment.reduce((a, e) => a + (e.current_power_kw || 0), 0)),
    );
    S.roomMeshes.forEach((r) => {
      const m = r.mesh as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || mat.color === undefined) return;
      const zone = zones.find((z) => z.id === r.zoneId);
      const status = (m.userData && m.userData.status) || (zone ? zoneStatus3D(zone) : "online");
      let color = STATUS_COLORS_NUM[status] ?? 0x94a3b8;
      if (vizMode === "consumption" && zone) {
        const p = zone.equipment.reduce((a, e) => a + (e.current_power_kw || 0), 0);
        const ratio = p / maxPower;
        color = new THREE.Color().setHSL(0.33 * (1 - ratio), 0.85, 0.45).getHex();
      } else if (vizMode === "sensor") {
        const offline = zone ? zone.equipment.filter((e) => e.status === "offline").length : 0;
        const total = zone ? zone.equipment.length || 1 : 1;
        color = offline > 0 ? 0x94a3b8 : STATUS_COLORS_NUM[zone ? zoneStatus3D(zone) : "online"];
        void total;
      } else if (vizMode === "equipment") {
        color = STATUS_COLORS_NUM[status] ?? 0x94a3b8;
      }
      mat.color.setHex(color);
      if (mat.emissive) mat.emissive.setHex(color);
    });
  }, [vizMode, floors]);

  // Inspection mode: focus camera on selected room; restore on exit.
  useEffect(() => {
    const S = stateRef.current;
    if (!S.camera || !selectedZoneId) return;
    if (inspectionMode) {
      setFloorFilter("all");
      S.floorFilter = "all";
      // find room position
      let target: THREE.Vector3 | null = null;
      if (S.scene) {
        S.scene.traverse((o) => {
          if (o.userData && o.userData.zoneId === selectedZoneId && o.type === "Group") {
            const wp = new THREE.Vector3();
            o.getWorldPosition(wp);
            target = wp;
          }
        });
      }
      if (target && (S as any).flyTo) {
        const t = target as THREE.Vector3;
        (S as any).flyTo(new THREE.Vector3(t.x + 2.5, t.y + 2.5, t.z + 2.5), t);
      }
    }
  }, [inspectionMode, selectedZoneId]);

  useEffect(() => {
    if (selectedZoneId == null) setInspectionMode(false);
  }, [selectedZoneId]);

  // Sync exploded/floorFilter state into three.js
  useEffect(() => {
    const S = stateRef.current;
    S.exploded = exploded;
    S.floorFilter = floorFilter;
    if ((S as any).applyFloorState) (S as any).applyFloorState();
  }, [exploded, floorFilter]);

  // Camera view presets
  useEffect(() => {
    const S = stateRef.current;
    if (!S.camera) return;
    const center = new THREE.Vector3(0, 1.5, 0);
    let pos = new THREE.Vector3(12, 10, 12);
    if (view === "top") pos = new THREE.Vector3(0, 22, 0.01);
    else if (view === "front") pos = new THREE.Vector3(0, 6, 16);
    else if (view === "side") pos = new THREE.Vector3(16, 6, 0);
    if ((S as any).flyTo) (S as any).flyTo(pos, center);
  }, [view]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-[#0F172A]", className)}
      role="img"
      aria-label="Vue 3D isométrique du bâtiment ESI-SBA"
    >
      {/* Control overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Visualization mode selector */}
        <div className="pointer-events-auto absolute left-4 top-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0F172A]/80 p-2 backdrop-blur-md">
            {(["status", "equipment", "sensor", "consumption"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setVizMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                  vizMode === m ? "bg-volt/20 text-volt" : "text-slate-300 hover:bg-white/10",
                )}
              >
                {m === "status" ? "Statut" : m === "equipment" ? "Équip." : m === "sensor" ? "Capteurs" : "Conso"}
              </button>
            ))}
          </div>
          {selectedZoneId != null && (
            <div className="flex gap-1.5 rounded-xl border border-white/10 bg-[#0F172A]/80 p-2 backdrop-blur-md">
              {!inspectionMode ? (
                <button
                  type="button"
                  onClick={() => setInspectionMode(true)}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Inspecter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setInspectionMode(false)}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-volt transition hover:bg-white/10"
                >
                  Vue complète
                </button>
              )}
            </div>
          )}
        </div>

        {/* Floor selector + exploded + views: bottom-right cluster */}
        <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0F172A]/80 p-2 backdrop-blur-md">
            {(["all", 0, 1] as const).map((f) => {
              const label = f === "all" ? "Tous" : f === 0 ? "RDC" : "1er";
              const active = floorFilter === (f === "all" ? "all" : f);
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFloorFilter(f === "all" ? "all" : f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                    active ? "bg-volt/20 text-volt" : "text-slate-300 hover:bg-white/10",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0F172A]/80 p-2 backdrop-blur-md">
            {(["perspective", "top", "front", "side"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                  view === v ? "bg-volt/20 text-volt" : "text-slate-300 hover:bg-white/10",
                )}
              >
                {v === "perspective" ? "3D" : v === "top" ? "Haut" : v === "front" ? "Face" : "Côté"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExploded((e) => !e)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                exploded ? "bg-volt/20 text-volt" : "text-slate-300 hover:bg-white/10",
              )}
            >
              Éclaté
            </button>
            <button
              type="button"
              onClick={() => {
                const S = stateRef.current;
                if ((S as any).flyTo) (S as any).flyTo(new THREE.Vector3(12, 10, 12), new THREE.Vector3(0, 1.5, 0));
              }}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { STATUS_COLORS as STATUS_COLORS_NATIVE };
