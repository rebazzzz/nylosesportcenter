const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../database/init");
const emailService = require("../services/emailService");
const {
  validateBody,
  contactSubmissionSchema,
} = require("../middleware/validation");

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "För många meddelanden har skickats. Försök igen senare." },
});

const CONTACT_INFO = [
  {
    type: "phone",
    value: "072-910 25 75",
    href: "tel:0729102575",
    display_order: 1,
  },
  {
    type: "phone",
    value: "070-042 42 21",
    href: "tel:0700424221",
    display_order: 2,
  },
  {
    type: "email",
    value: "nylosesportcenter@gmail.com",
    href: "mailto:nylosesportcenter@gmail.com",
    display_order: 3,
  },
];

router.get("/pricing", async (req, res) => {
  res.json({
    term_price: 600,
    currency: "SEK",
    term_length: "3 months",
    description: "Membership for the current training term",
  });
});

router.get("/contact-info", async (req, res) => {
  res.json(CONTACT_INFO);
});

router.get("/status", async (req, res) => {
  try {
    await db.getQuery("SELECT 1");
    res.json({
      status: "OK",
      message: "Nylöse SportCenter API is running",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      status: "ERROR",
      message: "Database connection failed",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post(
  "/contact",
  contactLimiter,
  validateBody(contactSubmissionSchema),
  async (req, res) => {
    try {
      const { name, email, message } = req.validatedBody;
      await db.createContactSubmission({ name, email, message });
      res.status(201).json({ message: "Meddelandet har skickats" });

      Promise.allSettled([
        emailService.sendContactConfirmation(email, { name, email, message }),
        emailService.sendContactNotification({ name, email, message }),
      ]).then((results) => {
        results
          .filter((result) => result.status === "rejected")
          .forEach((result) => console.error("Contact email flow failed:", result.reason));
      });
    } catch (error) {
      console.error("Contact submission error:", error);
      res.status(500).json({ error: "Meddelandet kunde inte skickas" });
    }
  },
);

module.exports = router;
