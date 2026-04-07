const jwt = require("jsonwebtoken");
const db = require("../database/init");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.split(" ")[1];
  const token = bearerToken || req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ error: "Inloggning krÃ¤vs" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getAuthUserById(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Ogiltig eller inaktiv anvÃ¤ndare" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Ogiltig eller utgÃ¥ngen inloggning" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "AdministratÃ¶rsbehÃ¶righet krÃ¤vs" });
  }
  next();
};

const requireMember = (req, res, next) => {
  if (req.user.role !== "member") {
    return res.status(403).json({ error: "MedlemsbehÃ¶righet krÃ¤vs" });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireMember,
};
