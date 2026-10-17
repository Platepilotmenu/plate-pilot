/**
 * Plate Pilot - Offers & Discounts Controller
 */

const db = require("../config/db");

/**
 * List Offers
 */
async function getOffers(req, res, next) {
  try {
    const { id } = req.params;
    const offers = await db.query(
      "SELECT * FROM offers WHERE restaurant_id = ? ORDER BY active DESC, created_at DESC;",
      [id]
    );

    return res.json({
      success: true,
      count: offers.length,
      offers: offers.map(o => ({
        id: o.id,
        restaurantId: o.restaurant_id,
        code: o.code,
        title: o.title,
        discountType: o.discount_type,
        value: parseFloat(o.value),
        minOrder: parseFloat(o.min_order || 0),
        description: o.description,
        active: !!o.active
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create New Offer
 */
async function createOffer(req, res, next) {
  try {
    const { id } = req.params;
    const { code, title, discountType, value, minOrder, description } = req.body;

    if (!code || !title || value === undefined) {
      return res.status(400).json({ success: false, error: "Code, title, and value are required." });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await db.queryOne("SELECT * FROM offers WHERE restaurant_id = ? AND code = ?;", [id, cleanCode]);
    if (existing) {
      return res.status(400).json({ success: false, error: `Promo code "${cleanCode}" already exists for this outlet.` });
    }

    const offerId = "off-" + Date.now();
    await db.execute(
      `INSERT INTO offers (id, restaurant_id, code, title, discount_type, value, min_order, description, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        offerId,
        id,
        cleanCode,
        title.trim(),
        discountType || "pct",
        parseFloat(value),
        parseFloat(minOrder) || 0,
        description || "",
        1
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Promo code "${cleanCode}" created.`,
      offer: {
        id: offerId,
        restaurantId: id,
        code: cleanCode,
        title: title.trim(),
        discountType: discountType || "pct",
        value: parseFloat(value),
        minOrder: parseFloat(minOrder) || 0,
        description: description || "",
        active: true
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Offer
 */
async function updateOffer(req, res, next) {
  try {
    const { id, offerId } = req.params;
    const { code, title, discountType, value, minOrder, description, active } = req.body;

    const existing = await db.queryOne("SELECT * FROM offers WHERE restaurant_id = ? AND id = ?;", [id, offerId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Offer not found." });
    }

    const newCode = code ? code.trim().toUpperCase() : existing.code;
    const newTitle = title !== undefined ? title.trim() : existing.title;
    const newType = discountType !== undefined ? discountType : existing.discount_type;
    const newValue = value !== undefined ? parseFloat(value) : existing.value;
    const newMin = minOrder !== undefined ? parseFloat(minOrder) : existing.min_order;
    const newDesc = description !== undefined ? description : existing.description;
    const newActive = active !== undefined ? (active ? 1 : 0) : existing.active;

    await db.execute(
      `UPDATE offers
       SET code = ?, title = ?, discount_type = ?, value = ?, min_order = ?, description = ?, active = ?
       WHERE restaurant_id = ? AND id = ?;`,
      [newCode, newTitle, newType, newValue, newMin, newDesc, newActive, id, offerId]
    );

    return res.json({
      success: true,
      message: `Offer "${newCode}" updated.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Offer
 */
async function deleteOffer(req, res, next) {
  try {
    const { id, offerId } = req.params;
    const existing = await db.queryOne("SELECT * FROM offers WHERE restaurant_id = ? AND id = ?;", [id, offerId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Offer not found." });
    }

    await db.execute("DELETE FROM offers WHERE restaurant_id = ? AND id = ?;", [id, offerId]);

    return res.json({
      success: true,
      message: `Offer "${existing.code}" deleted.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Validate Promo Code for Cart
 */
async function validateOffer(req, res, next) {
  try {
    const { id } = req.params;
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: "Promo code is required." });
    }

    const cleanCode = code.trim().toUpperCase();
    const offer = await db.queryOne(
      "SELECT * FROM offers WHERE restaurant_id = ? AND code = ? AND active = 1;",
      [id, cleanCode]
    );

    if (!offer) {
      return res.status(404).json({
        success: false,
        valid: false,
        error: `Promo code "${cleanCode}" is invalid or inactive.`
      });
    }

    const cartSubtotal = parseFloat(subtotal) || 0;
    const minOrder = parseFloat(offer.min_order || 0);

    if (cartSubtotal < minOrder) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: `Code requires a minimum subtotal of ₹${minOrder.toFixed(2)}. Add ₹${(minOrder - cartSubtotal).toFixed(2)} more.`
      });
    }

    let discountAmount = 0;
    if (offer.discount_type === "pct") {
      discountAmount = (cartSubtotal * parseFloat(offer.value)) / 100;
    } else {
      discountAmount = Math.min(cartSubtotal, parseFloat(offer.value));
    }

    return res.json({
      success: true,
      valid: true,
      discount: {
        code: offer.code,
        title: offer.title,
        discountType: offer.discount_type,
        value: parseFloat(offer.value),
        calculatedDiscount: Math.round(discountAmount * 100) / 100
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  validateOffer
};
