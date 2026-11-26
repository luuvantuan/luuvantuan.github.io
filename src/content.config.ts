import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { TOPICS } from "./site";

const topicNames = TOPICS.map((t) => t.name) as [string, ...string[]];

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    // Chỉ nhận các chủ đề khai báo trong src/site.ts (TOPICS). Gõ sai tên sẽ báo lỗi khi build.
    tags: z.array(z.enum(topicNames)).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
