
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const db = require("./config/DB");
const { corsOptions, requireTrustedOrigin } = require("./middleware/trustedOrigin");
const galleryDirectory = path.join(__dirname, "..", "Frontend", "Gallary");

const app = express();

app.use(cors(corsOptions()));
app.use(express.json());
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return requireTrustedOrigin(req, res, next);
  }
  next();
});
app.use("/Gallary", express.static(galleryDirectory));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/properties", require("./routes/property"));
app.use("/api/bookings", require("./routes/bookings"));

app.get("/", (req, res) => {
  res.json({
    message: "House Hunt API is running!"
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT DATABASE() AS database_name");
    res.json({
      message: "MySQL connected successfully",
      database: rows[0].database_name
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({ message: "Database connection failed" });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`House Hunt API running at http://localhost:${PORT}`);
});
