const { rateLimit } = require("express-rate-limit");

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: "Too many failed login attempts. Please wait 15 minutes before trying again."
  }
});

module.exports = loginRateLimit;
