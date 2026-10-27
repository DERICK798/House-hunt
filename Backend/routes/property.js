const express = require("express");
const fs = require("fs/promises");
const multer = require("multer");
const path = require("path");
const { randomUUID } = require("crypto");
const db = require("../config/DB");
const { authenticate, requireLandlord } = require("../middleware/auth");

const router = express.Router();
const galleryDirectory = path.join(__dirname, "..", "..", "Frontend", "Gallary");
const allowedImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

async function removeUploadedFiles(files) {
  await Promise.all((files || []).map((file) => fs.unlink(file.path).catch((error) => {
    if (error.code !== "ENOENT") {
      console.error("Could not remove an uncommitted property image:", error.message);
    }
  })));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, galleryDirectory),
    filename: (req, file, callback) => callback(null, `${randomUUID()}${allowedImageTypes.get(file.mimetype)}`)
  }),
  limits: { files: 8, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return callback(new Error("Only JPEG, PNG, and WebP images are supported."));
    }
    callback(null, true);
  }
});

router.get("/", async (req, res) => {
  try {
    const [properties] = await db.execute(
      `SELECT p.id, p.property_name, p.category, p.price, p.description, p.amenities,
              p.county, p.town, p.estate, p.status, p.created_at,
              GROUP_CONCAT(i.image_path ORDER BY i.id SEPARATOR '||') AS image_paths
       FROM properties p
       LEFT JOIN property_images i ON i.property_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );

    res.json({
      properties: properties.map((property) => ({
        ...property,
        images: property.image_paths ? property.image_paths.split("||") : []
      }))
    });
  } catch (error) {
    console.error("Could not load public properties:", error.message);
    res.status(500).json({ message: "Could not load properties." });
  }
});

router.use(authenticate, requireLandlord);

router.get("/mine", async (req, res) => {
  try {
    const [properties] = await db.execute(
      `SELECT p.id, p.property_name, p.category, p.price, p.description, p.amenities,
              p.county, p.town, p.estate, p.status, p.created_at,
              GROUP_CONCAT(i.image_path ORDER BY i.id SEPARATOR '||') AS image_paths
       FROM properties p
       LEFT JOIN property_images i ON i.property_id = p.id
       WHERE p.landlord_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({
      properties: properties.map((property) => ({
        ...property,
        images: property.image_paths ? property.image_paths.split("||") : []
      }))
    });
  } catch (error) {
    console.error("Could not load landlord properties:", error.message);
    res.status(500).json({ message: "Could not load your properties." });
  }
});

router.post("/", (req, res, next) => {
  fs.mkdir(galleryDirectory, { recursive: true }).then(() => next()).catch(next);
}, upload.array("images", 8), async (req, res) => {
  const { property_name, category, price, description, amenities, county, town, estate } = req.body;
  const parsedPrice = Number(price);

  if (
    typeof property_name !== "string" || !property_name.trim() || property_name.trim().length > 150 ||
    typeof category !== "string" || !category.trim() || category.trim().length > 50 ||
    !Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 99999999.99 ||
    (description !== undefined && typeof description !== "string") ||
    (amenities !== undefined && (typeof amenities !== "string" || amenities.length > 2000)) ||
    (county && (typeof county !== "string" || county.length > 100)) ||
    (town && (typeof town !== "string" || town.length > 100)) ||
    (estate && (typeof estate !== "string" || estate.length > 100))
  ) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ message: "Enter a valid title, category, and positive price." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO properties
       (landlord_id, property_name, category, price, description, amenities, county, town, estate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        property_name.trim(),
        category.trim(),
        parsedPrice,
        description?.trim() || null,
        amenities?.trim() || null,
        county?.trim() || null,
        town?.trim() || null,
        estate?.trim() || null
      ]
    );

    for (const file of req.files || []) {
      await connection.execute(
        "INSERT INTO property_images (property_id, image_path) VALUES (?, ?)",
        [result.insertId, `/Gallary/${file.filename}`]
      );
    }
    await connection.commit();
    res.status(201).json({
      message: "Property submitted for review.",
      property: {
        id: result.insertId,
        property_name: property_name.trim(),
        category: category.trim(),
        price: parsedPrice,
        description: description?.trim() || null,
        amenities: amenities?.trim() || null,
        county: county?.trim() || null,
        town: town?.trim() || null,
        estate: estate?.trim() || null,
        status: "pending",
        images: (req.files || []).map((file) => `/Gallary/${file.filename}`)
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    await removeUploadedFiles(req.files);
    console.error("Could not create property:", error.message);
    res.status(500).json({ message: "Could not save the property. Please try again." });
  } finally {
    connection?.release();
  }
});

router.delete("/:id", async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!Number.isSafeInteger(propertyId) || propertyId < 1) {
    return res.status(400).json({ message: "Invalid property ID." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [properties] = await connection.execute(
      "SELECT id FROM properties WHERE id = ? AND landlord_id = ? FOR UPDATE",
      [propertyId, req.user.id]
    );
    if (properties.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Property not found." });
    }

    const [images] = await connection.execute(
      "SELECT image_path FROM property_images WHERE property_id = ?",
      [propertyId]
    );
    await connection.execute("DELETE FROM property_images WHERE property_id = ?", [propertyId]);
    await connection.execute("DELETE FROM properties WHERE id = ?", [propertyId]);
    await connection.commit();

    await Promise.all(images.map(async ({ image_path }) => {
      const filename = path.basename(image_path);
      try {
        await fs.unlink(path.join(galleryDirectory, filename));
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Could not remove property image:", error.message);
        }
      }
    }));
    res.json({ message: "Property removed." });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Could not delete property:", error.message);
    res.status(500).json({ message: "Could not remove the property." });
  } finally {
    connection?.release();
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each image must be 5 MB or smaller."
      : "You can upload up to 8 images per property.";
    return res.status(400).json({ message });
  }
  if (error) {
    console.error("Property upload error:", error.message);
    return res.status(400).json({ message: error.message || "Could not process property images." });
  }
  next();
});

module.exports = router;