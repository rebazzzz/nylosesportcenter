const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../database/init");
const { authenticateToken } = require("../middleware/auth");
const {
  validateBody,
  registerSchema,
  loginSchema,
} = require("../middleware/validation");
const emailService = require("../services/emailService");

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "För många registreringsförsök. Försök igen senare." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "För många inloggningsförsök. Försök igen senare." },
});

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }

  return process.env.JWT_SECRET;
}

router.post("/register", registerLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      personnummer,
      phone,
      address,
      parent_name,
      parent_lastname,
      parent_phone,
    } = req.validatedBody;

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "En användare med den e-postadressen finns redan" });
    }

    const existingPersonnummer = await db.getUserByPersonnummer(personnummer);
    if (existingPersonnummer) {
      return res
        .status(409)
        .json({ error: "En användare med det personnumret finns redan" });
    }

    const passwordSeed =
      password ||
      `${Math.random().toString(36).slice(-12)}${Math.random()
        .toString(36)
        .slice(-12)}`;
    const passwordHash = await bcrypt.hash(passwordSeed, 12);

    const result = await db.createMember({
      email,
      password_hash: passwordHash,
      first_name,
      last_name,
      personnummer,
      phone,
      address,
      parent_name,
      parent_lastname,
      parent_phone,
    });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);

    await db.runQuery(
      "INSERT INTO memberships (user_id, start_date, end_date, status, payment_status, amount_paid) VALUES (?, ?, ?, ?, ?, ?)",
      [
        result.id,
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
        "active",
        "pending",
        600.0,
      ],
    );

    res.status(201).json({
      message: "Registreringen lyckades",
      user: {
        id: result.id,
        email,
        first_name,
        last_name,
        role: "member",
      },
    });

    emailService
      .sendRegistrationConfirmation(email, {
        first_name,
        last_name,
        membership_start: startDate.toISOString().split("T")[0],
        membership_end: endDate.toISOString().split("T")[0],
      })
      .catch((error) => {
        console.error("Failed to send registration email:", error);
      });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registreringen kunde inte genomföras" });
  }
});

router.post("/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedBody;
    const user = await db.getUserByEmail(email);

    if (!user || user.role !== "admin") {
      return res.status(401).json({ error: "Fel e-postadress eller lösenord" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Fel e-postadress eller lösenord" });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: "Kontot är inaktiverat" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: "7d" },
    );

    res.cookie("auth_token", token, getCookieOptions());

    res.json({
      message: "Inloggningen lyckades",
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Inloggningen misslyckades" });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      phone: req.user.phone,
      role: req.user.role,
      is_active: req.user.is_active,
    },
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie("auth_token", getCookieOptions());
  res.json({ message: "Utloggningen lyckades" });
});

module.exports = router;
