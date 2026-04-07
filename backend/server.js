const express = require("express");
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();

const db = require("./database/init");
const emailService = require("./services/emailService");
const PUBLIC_ROOT = path.join(__dirname, "..");
const PUBLIC_IMAGES = path.join(PUBLIC_ROOT, "images");
const PUBLIC_STYLES = path.join(PUBLIC_ROOT, "styles");
const PUBLIC_JS = path.join(PUBLIC_ROOT, "js");
const PUBLIC_PAGES = new Map([
  ["/", "index.html"],
  ["/about.html", "about.html"],
  ["/contact.html", "contact.html"],
  ["/registration.html", "registration.html"],
  ["/admin.html", "admin.html"],
  ["/admin-dashboard.html", "admin-dashboard.html"],
  ["/brottning-goteborg.html", "brottning-goteborg.html"],
  ["/brottning-barn-goteborg.html", "brottning-barn-goteborg.html"],
  ["/brottning-vuxna-goteborg.html", "brottning-vuxna-goteborg.html"],
  ["/girls-only-goteborg.html", "girls-only-goteborg.html"],
  ["/wresfit-goteborg.html", "wresfit-goteborg.html"],
  ["/kampsport-angered.html", "kampsport-angered.html"],
]);

function buildContentSecurityPolicy() {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
    connectSrc: ["'self'"],
    frameSrc: ["'self'", "https://www.google.com"],
    formAction: ["'self'"],
  };

  if (process.env.NODE_ENV === "production") {
    directives.upgradeInsecureRequests = [];
  }

  return { directives };
}

function setStaticCacheHeaders(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const longCacheExtensions = new Set([
    ".css",
    ".js",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".avif",
    ".svg",
    ".gif",
    ".mp4",
    ".webm",
    ".ico",
  ]);

  if (longCacheExtensions.has(extension)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  if (extension === ".html") {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  }
}

function setNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function sendPublicPage(res, pageFile, options = {}) {
  if (options.noStore) {
    setNoStoreHeaders(res);
  } else {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  }

  res.sendFile(path.join(PUBLIC_ROOT, pageFile));
}

function getAllowedOrigins() {
  return [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_APP_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean);
}

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: buildContentSecurityPolicy(),
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(cookieParser());
  app.use(compression());
  app.use(
    cors({
      origin(origin, callback) {
        const allowNullOrigin =
          process.env.NODE_ENV !== "production" && (!origin || origin === "null");

        if (allowNullOrigin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("OtillÃ¥ten CORS-begÃ¤ran"));
        }
      },
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: process.env.NODE_ENV === "production" ? 120 : 600,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use((req, res, next) => {
    const requestPath = req.path;

    if (
      requestPath.startsWith("/backend") ||
      requestPath.startsWith("/node_modules") ||
      requestPath.startsWith("/tmp-device-lab") ||
      requestPath.startsWith("/.git") ||
      requestPath.startsWith("/images/videos/") ||
      requestPath === "/images/videos" ||
      requestPath === "/images/Adobe Express - file.png" ||
      requestPath === "/images/logo_Nero_AI_Background_Remover_transparent.png" ||
      path.basename(requestPath).startsWith(".")
    ) {
      return res.status(404).send("Not found");
    }

    next();
  });
  app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"), {
      maxAge: "1y",
      immutable: true,
    }),
  );

  app.use("/images", express.static(PUBLIC_IMAGES, { setHeaders: setStaticCacheHeaders }));
  app.use("/styles", express.static(PUBLIC_STYLES, { setHeaders: setStaticCacheHeaders }));
  app.use("/js", express.static(PUBLIC_JS, { setHeaders: setStaticCacheHeaders }));

  app.get("/favicon.ico", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(path.join(PUBLIC_ROOT, "favicon.ico"));
  });

  app.get("/robots.txt", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.sendFile(path.join(PUBLIC_ROOT, "robots.txt"));
  });

  app.get("/sitemap.xml", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.sendFile(path.join(PUBLIC_ROOT, "sitemap.xml"));
  });

  app.get("/index.html", (req, res) => {
    res.redirect(301, "/");
  });

  PUBLIC_PAGES.forEach((pageFile, routePath) => {
    app.get(routePath, (req, res) => {
      sendPublicPage(res, pageFile, {
        noStore: pageFile === "admin.html" || pageFile === "admin-dashboard.html",
      });
    });
  });

  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/member", require("./routes/member"));
  app.use("/api/public", require("./routes/public"));

  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      error: "NÃ¥got gick fel",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internt serverfel",
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Sidan eller resursen hittades inte" });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3001);

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }

  await db.initDatabase();
  emailService.startInvoiceScheduler(db);

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Allowed origins: ${getAllowedOrigins().join(", ")}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
