const express = require("express");
const db = require("../database/init");
const { authenticateToken, requireMember } = require("../middleware/auth");
const {
  validateBody,
  memberProfileUpdateSchema,
} = require("../middleware/validation");

const router = express.Router();

// Apply authentication and member check to all routes
router.use(authenticateToken);
router.use(requireMember);
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Get member profile with membership info
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user info
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current membership
    const membership = await db.getQuery(
      `
      SELECT * FROM memberships
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `,
      [userId]
    );

    // Get payment history
    const payments = await db.getAllQuery(
      `
      SELECT p.*, m.start_date, m.end_date
      FROM payments p
      JOIN memberships m ON p.membership_id = m.id
      WHERE m.user_id = ?
      ORDER BY p.created_at DESC
    `,
      [userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        address: user.address,
        role: user.role,
        created_at: user.created_at,
      },
      membership,
      payments,
    });
  } catch (error) {
    console.error("Error fetching member profile:", error);
    res.status(500).json({ error: "Profilen kunde inte hÃ¤mtas" });
  }
});

// Renew membership
router.post("/membership/renew", async (req, res) => {
  try {
    const userId = req.user.id;

    // Check current membership
    const currentMembership = await db.getQuery(
      `
      SELECT * FROM memberships
      WHERE user_id = ? AND status = 'active'
      ORDER BY end_date DESC LIMIT 1
    `,
      [userId]
    );

    let startDate;
    if (
      currentMembership &&
      new Date(currentMembership.end_date) > new Date()
    ) {
      // Extend current membership
      startDate = new Date(currentMembership.end_date);
    } else {
      // Start new membership
      startDate = new Date();
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 3); // 3 months

    // Create new membership
    const membershipResult = await db.runQuery(
      "INSERT INTO memberships (user_id, start_date, end_date, status, payment_status, amount_paid) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId,
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
        "active",
        "pending",
        600.0,
      ]
    );

    res.status(201).json({
      message: "Medlemskapet har fÃ¶rnyats",
      membership: {
        id: membershipResult.id,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        status: "active",
        payment_status: "pending",
        amount_paid: 600.0,
      },
    });
  } catch (error) {
    console.error("Error renewing membership:", error);
    res.status(500).json({ error: "Medlemskapet kunde inte fÃ¶rnyas" });
  }
});

// Get payment history
router.get("/payments", async (req, res) => {
  try {
    const userId = req.user.id;

    const payments = await db.getAllQuery(
      `
      SELECT p.*, m.start_date, m.end_date, m.status as membership_status
      FROM payments p
      JOIN memberships m ON p.membership_id = m.id
      WHERE m.user_id = ?
      ORDER BY p.created_at DESC
    `,
      [userId]
    );

    res.json(payments);
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ error: "Betalningshistoriken kunde inte hÃ¤mtas" });
  }
});

// Update member profile
router.put("/profile", validateBody(memberProfileUpdateSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone, address } = req.validatedBody;

    await db.updateMemberProfile(userId, {
      first_name,
      last_name,
      phone,
      address,
    });

    const updatedUser = await db.getUserById(userId);
    res.json({
      message: "Profilen har uppdaterats",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        phone: updatedUser.phone,
        address: updatedUser.address,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Profilen kunde inte uppdateras" });
  }
});

// Get membership status
router.get("/membership/status", async (req, res) => {
  try {
    const userId = req.user.id;

    const membership = await db.getQuery(
      `
      SELECT * FROM memberships
      WHERE user_id = ? AND status = 'active'
      ORDER BY end_date DESC LIMIT 1
    `,
      [userId]
    );

    if (!membership) {
      return res.json({ status: "no_active_membership" });
    }

    const now = new Date();
    const endDate = new Date(membership.end_date);
    const isActive = endDate > now;

    res.json({
      membership: {
        id: membership.id,
        start_date: membership.start_date,
        end_date: membership.end_date,
        status: membership.status,
        payment_status: membership.payment_status,
        amount_paid: membership.amount_paid,
        is_active: isActive,
        days_remaining: isActive
          ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
          : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching membership status:", error);
    res.status(500).json({ error: "Medlemsstatus kunde inte hÃ¤mtas" });
  }
});

module.exports = router;
