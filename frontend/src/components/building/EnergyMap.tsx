"use client";

// Compatibility alias: some references use the name "EnergyMap" for the
// 3D building twin view. Re-export the Building3D scene so both names resolve.
export * from "./Building3D";
export { Building3D as EnergyMap } from "./Building3D";
export { Building3D as default } from "./Building3D";