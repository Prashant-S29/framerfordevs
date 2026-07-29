import { z } from "zod";

const projectKeyPattern = /^[a-z][a-z0-9-]{0,62}$/u;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

export const workspaceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(100, "Workspace names can contain at most 100 characters.")
    .refine((value) => !hasControlCharacter(value), "Remove control characters."),
});

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a project name.")
    .max(100, "Project names can contain at most 100 characters.")
    .refine((value) => !hasControlCharacter(value), "Remove control characters."),
  key: z
    .string()
    .trim()
    .min(1, "Enter a project key.")
    .max(63, "Project keys can contain at most 63 characters.")
    .refine(
      (value) => projectKeyPattern.test(value) && !value.includes("--") && !value.endsWith("-"),
      "Use lowercase letters, numbers, and single hyphens.",
    ),
  description: z.string().trim().max(500, "Descriptions can contain at most 500 characters."),
});

export const editProjectFormSchema = projectFormSchema.pick({
  name: true,
  description: true,
});

export function projectKeyFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-")
    .slice(0, 63)
    .replace(/-+$/gu, "");
}
