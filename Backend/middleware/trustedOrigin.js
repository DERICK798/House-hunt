const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://localhost:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function corsOptions() {
  return {
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  };
}

function requireTrustedOrigin(req, res, next) {
  if (!allowedOrigins.has(req.get("origin"))) {
    return res.status(403).json({ message: "Request origin is not allowed." });
  }
  next();
}

module.exports = { corsOptions, requireTrustedOrigin };
