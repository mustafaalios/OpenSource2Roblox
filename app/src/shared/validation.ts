import { z } from "zod";

export const appSettingsSchema = z.object({
  outputRoot: z.string().min(1),
  uploadAssets: z.boolean().default(true),
  uploadMeshes: z.boolean().default(false),
  robloxApiKey: z.string().default(""),
  robloxCreatorType: z.enum(["user", "group"]).default("user"),
  robloxCreatorId: z.string().default(""),
});

export const conversionJobSchema = z.object({
  gameDir: z.string(),
  mode: z.enum(["map", "model", "texture", "advanced"]),
  mapName: z.string().optional(),
  modelPath: z.string().optional(),
  texturePath: z.string().optional(),
  outputRoot: z.string().min(1),
  uploadAssets: z.boolean().optional(),
  uploadMeshes: z.boolean().optional(),
  robloxApiKey: z.string().optional(),
  robloxCreatorType: z.enum(["user", "group"]).optional(),
  robloxCreatorId: z.string().optional(),
}).superRefine((job, context) => {
  if (job.mode !== "texture" && job.gameDir.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A Source game folder is required for this conversion mode.",
      path: ["gameDir"],
    });
  }
});
