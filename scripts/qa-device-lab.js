const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3001";
const HEALTH_URL = `${BASE_URL}/api/health`;
const OUTPUT_DIR = path.join(process.cwd(), "tmp-device-lab");

const PAGES = [
  "/",
  "/about.html",
  "/contact.html",
  "/registration.html",
  "/brottning-goteborg.html",
  "/brottning-barn-goteborg.html",
  "/brottning-vuxna-goteborg.html",
  "/girls-only-goteborg.html",
  "/wresfit-goteborg.html",
  "/kampsport-angered.html",
];

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-14", width: 390, height: 844, mobile: true },
  { name: "ipad-mini", width: 768, height: 1024, mobile: true },
  { name: "tight-nav", width: 900, height: 900, mobile: false },
  { name: "small-laptop", width: 1024, height: 768, mobile: false },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function isServerHealthy() {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerHealthy()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function startLocalServer() {
  const child = spawn("node", ["server.js"], {
    cwd: path.join(process.cwd(), "backend"),
    stdio: "ignore",
    detached: false,
  });

  return child;
}

function routeToName(route) {
  if (route === "/") return "index";
  return route.replace(/^\//, "").replace(/\.html$/, "");
}

async function runSweep() {
  ensureOutputDir();

  let serverProcess = null;
  let startedServer = false;

  if (!(await isServerHealthy())) {
    startedServer = true;
    serverProcess = startLocalServer();

    const healthy = await waitForServer();
    if (!healthy) {
      if (serverProcess) {
        serverProcess.kill();
      }
      throw new Error(`Could not reach ${HEALTH_URL} after starting the local server.`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        deviceScaleFactor: viewport.mobile ? 2 : 1,
      });

      for (const route of PAGES) {
        const page = await context.newPage();
        const pageErrors = [];
        const consoleErrors = [];

        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") {
            consoleErrors.push(message.text());
          }
        });

        const url = `${BASE_URL}${route}`;
        const slug = `${routeToName(route)}-${viewport.name}`;

        try {
          const response = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30000,
          });

          const metrics = await page.evaluate(() => {
            const doc = document.documentElement;
            const body = document.body;
            const navHeights = Array.from(document.querySelectorAll(".nav-links a")).map(
              (link) => link.getBoundingClientRect().height,
            );
            const initialScrollX = window.scrollX;
            window.scrollTo(100000, 0);
            const maxHorizontalScroll = window.scrollX;
            window.scrollTo(initialScrollX, 0);

            return {
              statusTitle: document.title,
              overflowX: maxHorizontalScroll,
              brokenImages: Array.from(document.images).filter(
                (img) => img.complete && img.naturalWidth === 0,
              ).length,
              navWrap:
                window.innerWidth >= 769 &&
                window.innerWidth <= 984 &&
                navHeights.some((height) => height > 46),
            };
          });

          let mobileClickWorked = true;
          if (viewport.width <= 768) {
            const hamburger = page.locator(".hamburger");
            if (await hamburger.count()) {
              await hamburger.click();
              await page.waitForTimeout(250);

              const menuLinks = page.locator(".nav-links a");
              if ((await menuLinks.count()) > 1) {
                const destinationBefore = page.url();
                await menuLinks.nth(1).click();
                await page.waitForLoadState("networkidle");
                mobileClickWorked = page.url() !== destinationBefore;
              }
            }
          }

          const failures = [];
          if (response && response.status() !== 200) {
            failures.push(`status ${response.status()}`);
          }
          if (pageErrors.length) {
            failures.push(`pageerror ${pageErrors[0]}`);
          }
          if (consoleErrors.length) {
            failures.push(`console ${consoleErrors[0]}`);
          }
          if (metrics.overflowX > 2) {
            failures.push(`overflowX ${metrics.overflowX}`);
          }
          if (metrics.brokenImages > 0) {
            failures.push(`brokenImages ${metrics.brokenImages}`);
          }
          if (metrics.navWrap) {
            failures.push("nav-link-wrap");
          }
          if (!mobileClickWorked) {
            failures.push("mobile-menu-not-clickable");
          }

          if (failures.length) {
            await page.screenshot({
              path: path.join(OUTPUT_DIR, `${slug}.png`),
              fullPage: true,
            });
          }

          results.push({
            viewport: viewport.name,
            route,
            title: metrics.statusTitle,
            overflowX: metrics.overflowX,
            brokenImages: metrics.brokenImages,
            pageErrors: pageErrors.length,
            consoleErrors: consoleErrors.length,
            failures,
          });
        } catch (error) {
          results.push({
            viewport: viewport.name,
            route,
            failures: [`exception ${String(error)}`],
          });

          await page
            .screenshot({
              path: path.join(OUTPUT_DIR, `${slug}-exception.png`),
              fullPage: true,
            })
            .catch(() => {});
        } finally {
          await page.close();
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();

    if (startedServer && serverProcess) {
      serverProcess.kill();
    }
  }

  const summary = {
    baseUrl: BASE_URL,
    total: results.length,
    failures: results.filter((result) => result.failures.length > 0),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "results.json"),
    JSON.stringify(results, null, 2),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        total: results.length,
        failures: summary.failures.length,
        outputDir: OUTPUT_DIR,
      },
      null,
      2,
    ),
  );

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
}

runSweep().catch((error) => {
  console.error(error);
  process.exit(1);
});
