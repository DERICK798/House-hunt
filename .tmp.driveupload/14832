const express = require("express");
const db = require("../config/DB");
const { authenticate, requireLandlord, requireTenant } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, requireTenant, async (req, res) => {
  const propertyId = Number(req.body?.property_id);
  if (!Number.isSafeInteger(propertyId) || propertyId < 1) {
    return res.status(400).json({ message: "Choose a valid property." });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [properties] = await connection.execute(
      "SELECT id, landlord_id, status FROM properties WHERE id = ? FOR UPDATE",
      [propertyId]
    );
    if (properties.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "This property is no longer available." });
    }

    if (Number(properties[0].landlord_id) === Number(req.user.id)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: "You cannot request a booking for your own property." });
    }

    if (properties[0].status === "rejected" || properties[0].status === "booked") {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "This property is not accepting booking requests." });
    }

    const [existing] = await connection.execute(
      `SELECT id FROM bookings
       WHERE property_id = ? AND tenant_id = ? AND status IN ('pending', 'approved')
       LIMIT 1`,
      [propertyId, req.user.id]
    );
    if (existing.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "You already have an active request for this property." });
    }

    const [result] = await connection.execute(
      "INSERT INTO bookings (property_id, tenant_id, status) VALUES (?, ?, 'pending')",
      [propertyId, req.user.id]
    );
    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      message: "Your booking request was sent to the landlord.",
      booking: { id: result.insertId, property_id: propertyId, status: "pending" }
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("Could not create booking request:", error.message);
    res.status(500).json({ message: "Could not send your booking request." });
  } finally {
    connection?.release();
  }
});

router.get("/mine", authenticate, requireTenant, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [bookings] = await db.execute(
      `SELECT b.id, b.property_id, b.status, b.booking_date,
              p.property_name, p.category, p.price, p.town, p.county, p.estate,
              GROUP_CONCAT(i.image_path ORDER BY i.id SEPARATOR '||') AS image_paths
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       LEFT JOIN property_images i ON i.property_id = p.id
       WHERE b.tenant_id = ?
       GROUP BY b.id
       ORDER BY b.booking_date DESC`,
      [req.user.id]
    );
    res.json({
      bookings: bookings.map((booking) => ({
        ...booking,
        images: booking.image_paths ? booking.image_paths.split("||") : []
      }))
    });
  } catch (error) {
    console.error("Could not load tenant bookings:", error.message);
    res.status(500).json({ message: "Could not load your booking requests." });
  }
});

router.post("/:id/cancel", authenticate, requireTenant, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: "Invalid booking ID." });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [bookings] = await connection.execute(
      "SELECT id, status FROM bookings WHERE id = ? AND tenant_id = ? FOR UPDATE",
      [bookingId, req.user.id]
    );
    if (bookings.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Booking request not found." });
    }
    if (bookings[0].status !== "pending") {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "Only pending booking requests can be cancelled." });
    }

    await connection.execute(
      "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
      [bookingId]
    );
    await connection.commit();
    transactionStarted = false;
    res.json({ message: "Booking request cancelled." });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("Could not cancel booking request:", error.message);
    res.status(500).json({ message: "Could not cancel the booking request." });
  } finally {
    connection?.release();
  }
});

router.get("/landlord", authenticate, requireLandlord, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const [bookings] = await db.execute(
      `SELECT b.id, b.property_id, b.tenant_id, b.status, b.booking_date,
              p.property_name, p.category, p.price,
              u.full_name AS tenant_name, u.email AS tenant_email, u.phone AS tenant_phone
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       JOIN users u ON u.id = b.tenant_id
       WHERE p.landlord_id = ?
       ORDER BY b.booking_date DESC`,
      [req.user.id]
    );
    res.json({ bookings });
  } catch (error) {
    console.error("Could not load landlord booking requests:", error.message);
    res.status(500).json({ message: "Could not load booking requests." });
  }
});

router.patch("/:id", authenticate, requireLandlord, async (req, res) => {
  const bookingId = Number(req.params.id);
  const decision = req.body?.decision;
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: "Invalid booking ID." });
  }
  if (decision !== "approve" && decision !== "reject") {
    return res.status(400).json({ message: "Choose approve or reject." });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [bookings] = await connection.execute(
      `SELECT b.id, b.property_id, b.status
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       WHERE b.id = ? AND p.landlord_id = ?
       FOR UPDATE`,
      [bookingId, req.user.id]
    );
    if (bookings.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Booking request not found." });
    }
    if (bookings[0].status !== "pending") {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "This booking request has already been reviewed." });
    }

    const [properties] = await connection.execute(
      "SELECT id, status FROM properties WHERE id = ? FOR UPDATE",
      [bookings[0].property_id]
    );
    if (decision === "approve" && !["pending", "approved"].includes(properties[0].status)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "This property is no longer eligible for booking." });
    }

    const bookingStatus = decision === "approve" ? "approved" : "rejected";
    await connection.execute(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [bookingStatus, bookingId]
    );
    if (decision === "approve") {
      await connection.execute(
        "UPDATE properties SET status = 'booked' WHERE id = ?",
        [bookings[0].property_id]
      );
      await connection.execute(
        "UPDATE bookings SET status = 'rejected' WHERE property_id = ? AND id <> ? AND status = 'pending'",
        [bookings[0].property_id, bookingId]
      );
    }

    await connection.commit();
    transactionStarted = false;
    res.json({ message: `Booking request ${bookingStatus}.`, status: bookingStatus });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("Could not review booking request:", error.message);
    res.status(500).json({ message: "Could not review the booking request." });
  } finally {
    connection?.release();
  }
});

module.exports = router;
