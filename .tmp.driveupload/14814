const jwt = require("jsonwebtoken");
const { clearAuthCookie, readAuthCookie } = require("./authCookie");

function authenticate(req, res, next) {
  const token = readAuthCookie(req);

  if (!token) {
    return res.status(401).json({ message: "Please sign in to continue." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      clearAuthCookie(res);
      return res.status(401).json({ message: "Your session is invalid or has expired. Please sign in again." });
    }
    console.error("Authentication error:", error.message);
    return res.status(500).json({ message: "Could not verify your session." });
  }
}

function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: "Signed out." });
}

function requireLandlord(req, res, next) {
  if (req.user.role !== "landlord") {
    return res.status(403).json({ message: "Only landlords can manage properties." });
  }
  next();
}

function requireTenant(req, res, next) {
  if (req.user.role !== "tenant") {
    return res.status(403).json({ message: "Only tenants can manage bookings." });
  }
  next();
}

module.exports = { authenticate, logout, requireLandlord, requireTenant };
