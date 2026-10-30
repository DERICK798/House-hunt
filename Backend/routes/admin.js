const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/DB");
const { AUTH_COOKIE_NAME, authCookieOptions } = require("../middleware/authCookie");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();
const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@haven.com").trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

async function ensureDefaultAdmin() {
  const [existing] = await db.execute(
    "SELECT id FROM admins WHERE email = ?",
    [DEFAULT_ADMIN_EMAIL]
  );

  if (existing.length > 0) {
    return;
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  await db.execute(
    "INSERT INTO admins (full_name, email, password) VALUES (?, ?, ?)",
    ["System Administrator", DEFAULT_ADMIN_EMAIL, hashedPassword]
  );
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    await ensureDefaultAdmin();

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

router.get("/me", authenticate, requireAdmin, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    user: {
      id: req.user.id,
      role: req.user.role,
      full_name: req.user.full_name || "Administrator"
    }
  });
});

router.get("/properties", authenticate, requireAdmin, async (req, res) => {
  const status = req.query.status;
  const params = [];
  let whereClause = "";

  if (status && ["pending", "approved", "rejected"].includes(status)) {
    whereClause = " WHERE p.status = ?";
    params.push(status);
  }

  try {
    const [properties] = await db.execute(
      `SELECT p.id, p.property_name, p.category, p.price, p.description, p.amenities,
              p.county, p.town, p.estate, p.status, p.created_at,
              u.full_name AS landlord_name, u.email AS landlord_email,
              GROUP_CONCAT(i.image_path ORDER BY i.id SEPARATOR '||') AS image_paths
       FROM properties p
       JOIN users u ON u.id = p.landlord_id
       LEFT JOIN property_images i ON i.property_id = p.id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      params
    );

    res.json({
      properties: properties.map((property) => ({
        ...property,
        images: property.image_paths ? property.image_paths.split("||") : []
      }))
    });
  } catch (error) {
    console.error("Could not load admin property queue:", error.message);
    res.status(500).json({ message: "Could not load the property review queue." });
  }
});

router.patch("/properties/:id", authenticate, requireAdmin, async (req, res) => {
  const propertyId = Number(req.params.id);
  const decision = req.body?.decision;

  if (!Number.isSafeInteger(propertyId) || propertyId < 1) {
    return res.status(400).json({ message: "Invalid property ID." });
  }

  if (decision !== "approve" && decision !== "reject") {
    return res.status(400).json({ message: "Choose approve or reject." });
  }

  try {
    const [properties] = await db.execute(
      "SELECT id, status FROM properties WHERE id = ? FOR UPDATE",
      [propertyId]
    );

    if (properties.length === 0) {
      return res.status(404).json({ message: "Property not found." });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    await db.execute(
      "UPDATE properties SET status = ? WHERE id = ?",
      [nextStatus, propertyId]
    );

    res.json({
      message: `Property ${decision}d successfully.`,
      property: {
        id: properties[0].id,
        status: nextStatus
      }
    });
  } catch (error) {
    console.error("Could not update property review status:", error.message);
    res.status(500).json({ message: "Could not process the property review." });
  }
});

router.get("/summary", authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT status, COUNT(*) AS total FROM properties GROUP BY status ORDER BY status"
    );

    res.json({
      summary: rows.reduce((accumulator, item) => {
        accumulator[item.status] = Number(item.total);
        return accumulator;
      }, {})
    });
  } catch (error) {
    console.error("Could not load admin summary:", error.message);
    res.status(500).json({ message: "Could not load the admin summary." });
  }
});

module.exports = router;
