const express = require("express");
const db = require("../database/init");
const emailService = require("../services/emailService");
const { validateBody, adminManualPaymentEmailSchema } = require("../middleware/validation");
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

router.post("/send-payment-info", validateBody(adminManualPaymentEmailSchema), async (req, res) => {
  try {
    const { email } = req.validatedBody;
    const member = await db.getMemberWithLatestMembershipByEmail(email);

    if (!member) {
      return res.status(404).json({ error: "Ingen medlem hittades med den e-postadressen" });
    }

    if (!member.membership_id) {
      return res.status(400).json({ error: "Medlemmen har inget medlemskap att skicka betaluppgifter för" });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);

    const result = await emailService.sendManualPaymentInfo(member.email, {
      first_name: member.first_name,
      membership_start: member.start_date,
      membership_end: member.end_date,
      due_date: dueDate.toISOString(),
      amount: member.amount_paid || 600,
    });

    if (!result.success) {
      return res.status(502).json({ error: result.error || "Betaluppgifterna kunde inte skickas" });
    }

    await emailService.sendAdminInvoiceAlert({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      amount: member.amount_paid || 600,
      trigger: "Manuellt från adminpanelen",
    });

    res.json({ message: "Betaluppgifterna har skickats" });
  } catch (error) {
    console.error("Error sending manual payment info:", error);
    res.status(500).json({ error: "Betaluppgifterna kunde inte skickas" });
  }
});

module.exports = router;
