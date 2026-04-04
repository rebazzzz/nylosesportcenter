const express = require("express");
const db = require("../database/init");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

router.get("/statistics", async (req, res) => {
  try {
    const [totalMembers, recentMembers, pendingMemberships] = await Promise.all([
      db.getQuery('SELECT COUNT(*) as count FROM users WHERE role = "member"'),
      db.getQuery(
        "SELECT COUNT(*) as count FROM users WHERE role = 'member' AND created_at >= date('now', '-30 days')",
      ),
      db.getQuery(
        "SELECT COUNT(*) as count FROM memberships WHERE payment_status = 'pending'",
      ),
    ]);

    res.json({
      totalMembers: totalMembers.count,
      recentMembers: recentMembers.count,
      pendingMemberships: pendingMemberships.count,
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

router.get("/members", async (req, res) => {
  try {
    const members = await db.getMembersForAdmin();
    res.json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

router.get("/contact-submissions", async (req, res) => {
  try {
    const submissions = await db.getContactSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error("Error fetching contact submissions:", error);
    res.status(500).json({ error: "Failed to fetch contact submissions" });
  }
});

module.exports = router;
