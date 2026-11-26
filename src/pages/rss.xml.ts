import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE } from "../site";
import { getPosts } from "../utils";

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>vi</language>`,
  });
}
