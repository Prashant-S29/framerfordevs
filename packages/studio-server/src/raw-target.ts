// Rejects ambiguous request targets before framework URL normalization can erase their spelling.

const portableMount = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;
const safeTarget = /^[\x21-\x7e]+$/u;
const assetName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const maximumRawTargetBytes = 8 * 1_024;

export interface ParsedStudioTarget {
  readonly path: string;
  readonly query: string;
  readonly route: string;
}

export function isPortableStudioMountPath(value: string): boolean {
  return portableMount.test(value);
}

export function parseStudioRawTarget(
  rawTarget: string,
  mountPath: string,
): ParsedStudioTarget | null {
  if (
    !isPortableStudioMountPath(mountPath) ||
    rawTarget.length < 1 ||
    rawTarget.length > maximumRawTargetBytes ||
    !safeTarget.test(rawTarget) ||
    !rawTarget.startsWith("/") ||
    rawTarget.startsWith("//") ||
    rawTarget.includes("\\") ||
    rawTarget.includes("#")
  ) {
    return null;
  }
  const queryIndex = rawTarget.indexOf("?");
  const path = queryIndex < 0 ? rawTarget : rawTarget.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : rawTarget.slice(queryIndex + 1);
  if (path.includes("%")) return null;
  if (!path.startsWith(`${mountPath}/`) && path !== mountPath) return null;
  if (path.includes("//") || path.split("/").some((part) => part === "." || part === ".."))
    return null;
  const route = path.slice(mountPath.length) || "/";
  if (route.startsWith("/assets/")) {
    const name = route.slice("/assets/".length);
    if (!assetName.test(name)) return null;
  }
  return { path, query, route };
}
