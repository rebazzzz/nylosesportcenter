const jwt = require("jsonwebtoken");
const db = require("../database/init");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.split(" ")[1];
  const token = bearerToken || req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getUserById(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid or inactive user" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const requireMember = (req, res, next) => {
  if (req.user.role !== "member") {
    return res.status(403).json({ error: "Member access required" });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireMember,
};
