const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/DB");
const { AUTH_COOKIE_NAME, authCookieOptions } = require("../middleware/authCookie");
const { authenticate, logout } = require("../middleware/auth");
const loginRateLimit = require("../middleware/loginRateLimit");

const router = express.Router();

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[\d]+$/.test(phone)) return null;
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;

  const digits = phone.replace(/^\+/, "");
  if (/^0[17]\d{8}$/.test(digits)) {
    return `+254${digits.slice(1)}`;
  }
  if (/^254[17]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^\+[1-9]\d{6,14}$/.test(phone)) {
    return phone;
  }
  if (!phone.startsWith("+") && /^\d{7,15}$/.test(digits)) {
    return digits;
  }
  return null;
}

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;

    if (
      typeof full_name !== "string" || !full_name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password ||
      typeof role !== "string"
    ) {
      return res.status(400).json({
        message: "Full name, email, phone, password, and role are required."
      });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        message: "Enter a valid phone number, such as 0712345678 or +254712345678."
      });
    }

    if (!["tenant", "landlord"].includes(role)) {
      return res.status(400).json({
        message: "Role must be tenant or landlord"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const [existing] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    const [existingPhone] = await db.execute(
      "SELECT id FROM users WHERE phone = ?",
      [normalizedPhone]
    );
    if (existingPhone.length > 0) {
      return res.status(409).json({
        message: "This phone number is already used by another account."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.execute(
      `INSERT INTO users (full_name, email, phone, password, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name.trim(), email.trim().toLowerCase(), normalizedPhone, hashedPassword, role]
    );

    res.status(201).json({
      message: "Registration successful. You can now log in."
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This email or phone number is already used by another account."
      });
    }
    console.error("Registration error:", error.message);
    res.status(500).json({
      message: "Registration failed"
    });
  }
});

// LOGIN
router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password ||
      !["tenant", "landlord"].includes(role)
    ) {
      return res.status(400).json({
        message: "Email, password, and account role are required."
      });
    }

    const [users] = await db.execute(
      "SELECT id, full_name, email, password, role FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    if (user.role !== role) {
      return res.status(403).json({
        message: `This account is registered as a ${user.role}. Choose that role and sign in again.`
      });
    }

    res.set("Cache-Control", "no-store");
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({
      message: "Login failed"
    });
  }
});

router.get("/me", authenticate, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    user: {
      id: req.user.id,
      role: req.user.role
    }
  });
});

router.post("/admin-login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const [admins] = await db.execute(
      "SELECT id, full_name, email, password FROM admins WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    if (admins.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const admin = admins[0];
    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.set("Cache-Control", "no-store");
    const token = jwt.sign(
      { id: admin.id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    res.json({
      message: "Admin login successful",
      user: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
        role: "admin"
      }
    });
  } catch (error) {
    console.error("Admin login error:", error.message);
    res.status(500).json({ message: "Admin login failed" });
  }
});

router.post("/logout", logout);

module.exports = router;
