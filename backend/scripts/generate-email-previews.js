const fs = require("fs");
const path = require("path");

const emailService = require("../services/emailService");

const outputDir = path.join(__dirname, "..", "email-previews");

function ensureDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
}

function buildIndexPage(previews) {
  const cards = previews
    .map(
      (preview) => `
        <article class="card">
          <p class="card-label">${preview.label}</p>
          <h2>${preview.subject}</h2>
          <a href="./${preview.slug}.html">Öppna</a>
        </article>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mejlmallar</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f5f5f2; color: #111; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 20px 48px; }
      h1 { margin: 0 0 10px; font-size: 34px; }
      .lead { margin: 0 0 26px; color: #57616c; max-width: 620px; line-height: 1.6; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
      .card { background: #fff; border: 1px solid #d9dee3; border-radius: 16px; padding: 18px; }
      .card h2 { margin: 0 0 14px; font-size: 20px; line-height: 1.35; color: #111; }
      .card-label { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #68727d; font-weight: 700; }
      .card a { display: inline-block; color: #fff; text-decoration: none; background: #102a43; padding: 11px 16px; border-radius: 999px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Mejlmallar</h1>
      <p class="lead">Lokala förhandsvisningar av alla mejl utan att skicka något. Klicka på en mall för att öppna den.</p>
      <section class="grid">${cards}</section>
    </main>
  </body>
</html>
`;
}

function main() {
  ensureDir(outputDir);

  const previews = emailService.getPreviewTemplates();

  previews.forEach((preview) => {
    writeFile(path.join(outputDir, `${preview.slug}.html`), preview.htmlContent);
  });

  writeFile(path.join(outputDir, "index.html"), buildIndexPage(previews));

  console.log(`Generated ${previews.length} email previews in ${outputDir}`);
  console.log(`Open ${path.join(outputDir, "index.html")} in your browser.`);
}

main();
