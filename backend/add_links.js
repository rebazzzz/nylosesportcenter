const db = require("./database/init");

async function addMissingLinks() {
  try {
    await db.initDatabase();

    // Add Instagram
    await db.runQuery(
      "INSERT OR IGNORE INTO social_media_links (platform, url, icon_class, display_order) VALUES (?, ?, ?, ?)",
      [
        "instagram",
        "https://www.instagram.com/nylosegirls/",
        "fab fa-instagram",
        2,
      ],
    );

    // Add TikTok
    await db.runQuery(
      "INSERT OR IGNORE INTO social_media_links (platform, url, icon_class, display_order) VALUES (?, ?, ?, ?)",
      ["tiktok", "https://www.tiktok.com/@nylosegirls", "fab fa-tiktok", 3],
    );

    console.log("Added missing social media links");

    const allLinks = await db.getAllQuery("SELECT * FROM social_media_links");
    console.log("All social media links:", allLinks);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

addMissingLinks();
