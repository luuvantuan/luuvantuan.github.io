module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("_posts/*.md")
                        .sort((a,b) => b.date - a.date);
  });
  return {
    dir: { input: ".", includes: "_includes", output: "_site" }
  };
};