const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Directories to minify
const jsDir = "js";
const cssDir = "styles";
const minJsDir = "js/min";
const minCssDir = "styles/min";
const htmlFiles = fs
  .readdirSync(".")
  .filter((file) => file.endsWith(".html"));
const jsFilesToMinify = [
  "admin-dashboard.js",
  "admin.js",
  "components.js",
  "contact.js",
  "generated-media.js",
  "registration.js",
  "scripts.js",
];
const cssFilesToMinify = [
  "about.css",
  "admin.css",
  "base.css",
  "contact.css",
  "gg.css",
  "index.css",
  "landing.css",
  "registration.css",
  "responsivity.css",
];
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Ensure min directories exist
if (!fs.existsSync(minJsDir)) {
  fs.mkdirSync(minJsDir, { recursive: true });
}
if (!fs.existsSync(minCssDir)) {
  fs.mkdirSync(minCssDir, { recursive: true });
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    return [fullPath];
  });
}

function generateMediaManifest() {
  const carouselDir = path.join("images", "carousel");
  const outputPath = path.join(jsDir, "generated-media.js");

  const readMedia = (directory, allowedExtensions) => {
    if (!fs.existsSync(directory)) {
      return [];
    }

    return fs
      .readdirSync(directory)
      .filter((file) => allowedExtensions.has(path.extname(file).toLowerCase()))
      .sort((left, right) => left.localeCompare(right, "sv"))
      .map((file) => `${directory.replaceAll("\\", "/")}/${file}`);
  };

  const manifest = {
    carouselImages: readMedia(carouselDir, imageExtensions),
  };

  const fileContents = `window.NYLOSE_MEDIA = ${JSON.stringify(
    manifest,
    null,
    2
  )};\n`;

  fs.writeFileSync(outputPath, fileContents, "utf8");
  console.log(
    `Generated media manifest with ${manifest.carouselImages.length} images.`
  );
}

function generateSitemap() {
  const sitemapPages = [
    { loc: "https://nylosesportcenter.se/nylose/", priority: "1.0", changefreq: "weekly" },
    { loc: "https://nylosesportcenter.se/nylose/about.html", priority: "0.8", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/contact.html", priority: "0.8", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/registration.html", priority: "0.8", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/brottning-goteborg.html", priority: "0.85", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/brottning-barn-goteborg.html", priority: "0.84", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/brottning-vuxna-goteborg.html", priority: "0.84", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/girls-only-goteborg.html", priority: "0.84", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/wresfit-goteborg.html", priority: "0.84", changefreq: "monthly" },
    { loc: "https://nylosesportcenter.se/nylose/kampsport-angered.html", priority: "0.84", changefreq: "monthly" },
  ];

  const lastmod = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPages
    .map(
      (page) => `  <url>\n    <loc>${page.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`,
    )
    .join("\n")}\n</urlset>\n`;

  fs.writeFileSync("sitemap.xml", xml, "utf8");
  console.log(`Generated sitemap for ${sitemapPages.length} public pages.`);
}

// Function to minify JS files
function minifyJS() {
  jsFilesToMinify.forEach((file) => {
    const inputPath = path.join(jsDir, file);
    const outputPath = path.join(minJsDir, file.replace(".js", ".min.js"));
    if (!fs.existsSync(inputPath)) {
      console.warn(`Skipping missing JS source: ${file}`);
      return;
    }
    try {
      execSync(
        `npx uglifyjs "${inputPath}" -o "${outputPath}" --compress`
      );
      console.log(`Minified JS: ${file} -> ${path.basename(outputPath)}`);
    } catch (error) {
      console.error(`Error minifying ${file}:`, error.message);
    }
  });
}

// Function to minify CSS files
function minifyCSS() {
  cssFilesToMinify.forEach((file) => {
    const inputPath = path.join(cssDir, file);
    const outputPath = path.join(minCssDir, file.replace(".css", ".min.css"));
    if (!fs.existsSync(inputPath)) {
      console.warn(`Skipping missing CSS source: ${file}`);
      return;
    }
    try {
      execSync(`npx cleancss -o "${outputPath}" "${inputPath}"`);
      console.log(`Minified CSS: ${file} -> ${path.basename(outputPath)}`);
    } catch (error) {
      console.error(`Error minifying ${file}:`, error.message);
    }
  });
}

function validateHtmlReferences() {
  const issues = [];

  htmlFiles.forEach((file) => {
    const contents = fs.readFileSync(file, "utf8");

    const scriptMatches = [
      ...contents.matchAll(/<script[^>]+src="([^"]+)"/g),
    ].map((match) => match[1]);
    const styleMatches = [
      ...contents.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
    ].map((match) => match[1]);

    scriptMatches.forEach((src) => {
      if (src.startsWith("http")) {
        return;
      }
      if (src.startsWith("js/") && !src.startsWith("js/min/")) {
        issues.push(`${file}: non-minified script reference -> ${src}`);
      }
      if (src.startsWith("js/min/") && !fs.existsSync(src)) {
        issues.push(`${file}: missing minified script -> ${src}`);
      }
    });

    styleMatches.forEach((href) => {
      if (href.startsWith("http")) {
        return;
      }
      if (href.startsWith("styles/") && !href.startsWith("styles/min/")) {
        issues.push(`${file}: non-minified stylesheet reference -> ${href}`);
      }
      if (href.startsWith("styles/min/") && !fs.existsSync(href)) {
        issues.push(`${file}: missing minified stylesheet -> ${href}`);
      }
    });
  });

  if (issues.length === 0) {
    console.log("HTML asset validation passed.");
    return;
  }

  console.warn("HTML asset validation found issues:");
  issues.forEach((issue) => console.warn(`- ${issue}`));
}

// Run minification
console.log("Starting minification...");
generateMediaManifest();
generateSitemap();
minifyJS();
minifyCSS();
validateHtmlReferences();
console.log("Minification complete!");
