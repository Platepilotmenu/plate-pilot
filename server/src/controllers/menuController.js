/**
 * Plate Pilot - Menu & Categories Controller
 */

const db = require("../config/db");

/**
 * List Categories for Restaurant
 */
async function getCategories(req, res, next) {
  try {
    const { id } = req.params;
    const categories = await db.query(
      "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order ASC, name ASC;",
      [id]
    );

    return res.json({
      success: true,
      categories: categories.map(c => ({ id: c.id, name: c.name, sortOrder: c.sort_order }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add New Category
 */
async function createCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Category name is required." });
    }

    const catId = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const existing = await db.queryOne("SELECT * FROM categories WHERE restaurant_id = ? AND id = ?;", [id, catId]);

    if (existing) {
      return res.status(400).json({ success: false, error: "Category already exists." });
    }

    const countRes = await db.queryOne("SELECT COUNT(*) AS count FROM categories WHERE restaurant_id = ?;", [id]);
    const sortOrder = countRes ? countRes.count : 0;

    await db.execute(
      "INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?);",
      [catId, id, name.trim(), sortOrder]
    );

    return res.status(201).json({
      success: true,
      category: { id: catId, name: name.trim(), sortOrder }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Category
 */
async function deleteCategory(req, res, next) {
  try {
    const { id, categoryId } = req.params;

    // Check if items are using this category
    const itemCountRes = await db.queryOne(
      "SELECT COUNT(*) AS count FROM menu_items WHERE restaurant_id = ? AND category_id = ?;",
      [id, categoryId]
    );

    if (itemCountRes && itemCountRes.count > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete category: ${itemCountRes.count} menu item(s) are assigned to it.`
      });
    }

    await db.execute(
      "DELETE FROM categories WHERE restaurant_id = ? AND id = ?;",
      [id, categoryId]
    );

    return res.json({
      success: true,
      message: "Category deleted."
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List Menu Items for Restaurant
 */
async function getMenuItems(req, res, next) {
  try {
    const { id } = req.params;
    const { category, search, inStockOnly } = req.query;

    let sql = "SELECT * FROM menu_items WHERE restaurant_id = ?";
    const params = [id];

    if (category && category !== "all") {
      sql += " AND category_id = ?";
      params.push(category);
    }

    if (inStockOnly === "true") {
      sql += " AND in_stock = 1";
    }

    if (search) {
      sql += " AND (title LIKE ? OR subtitle LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY title ASC;";
    const items = await db.query(sql, params);

    return res.json({
      success: true,
      count: items.length,
      items: items.map(it => ({
        id: it.id,
        restaurantId: it.restaurant_id,
        category: it.category_id,
        title: it.title,
        subtitle: it.subtitle,
        price: parseFloat(it.price),
        cost: parseFloat(it.cost || 0),
        stock: it.stock,
        inStock: !!it.in_stock,
        image: it.image
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create New Menu Item
 */
async function createMenuItem(req, res, next) {
  try {
    const { id } = req.params;
    const { title, subtitle, price, cost, category, stock, image } = req.body;

    if (!title || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        error: "Title, price and category are required."
      });
    }

    const itemId = "item-" + Date.now();
    const parsedPrice = parseFloat(price) || 0;
    const parsedCost = parseFloat(cost) || (parsedPrice * 0.3);
    const parsedStock = parseInt(stock) !== undefined && !isNaN(parseInt(stock)) ? parseInt(stock) : 50;
    const defaultImg = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60";

    await db.execute(
      `INSERT INTO menu_items (id, restaurant_id, category_id, title, subtitle, price, cost, stock, in_stock, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        itemId,
        id,
        category,
        title.trim(),
        (subtitle || "").trim(),
        parsedPrice,
        parsedCost,
        parsedStock,
        parsedStock > 0 ? 1 : 0,
        image || defaultImg
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Menu item "${title}" created.`,
      item: {
        id: itemId,
        restaurantId: id,
        category,
        title: title.trim(),
        subtitle: (subtitle || "").trim(),
        price: parsedPrice,
        cost: parsedCost,
        stock: parsedStock,
        inStock: parsedStock > 0,
        image: image || defaultImg
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Menu Item
 */
async function updateMenuItem(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const { title, subtitle, price, cost, category, stock, inStock, image } = req.body;

    const existing = await db.queryOne(
      "SELECT * FROM menu_items WHERE restaurant_id = ? AND id = ?;",
      [id, itemId]
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: "Menu item not found." });
    }

    const newTitle = title !== undefined ? title.trim() : existing.title;
    const newSubtitle = subtitle !== undefined ? subtitle.trim() : existing.subtitle;
    const newPrice = price !== undefined ? parseFloat(price) : existing.price;
    const newCost = cost !== undefined ? parseFloat(cost) : existing.cost;
    const newCategory = category !== undefined ? category : existing.category_id;
    const newStock = stock !== undefined ? parseInt(stock) : existing.stock;
    const newInStock = inStock !== undefined ? (inStock ? 1 : 0) : existing.in_stock;
    const newImage = image !== undefined ? image : existing.image;

    await db.execute(
      `UPDATE menu_items
       SET title = ?, subtitle = ?, price = ?, cost = ?, category_id = ?, stock = ?, in_stock = ?, image = ?
       WHERE restaurant_id = ? AND id = ?;`,
      [newTitle, newSubtitle, newPrice, newCost, newCategory, newStock, newInStock, newImage, id, itemId]
    );

    return res.json({
      success: true,
      message: `Item "${newTitle}" updated.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Quick Stock & 86 Item Toggle
 */
async function toggleItemStock(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const { inStock, stock } = req.body;

    const existing = await db.queryOne(
      "SELECT * FROM menu_items WHERE restaurant_id = ? AND id = ?;",
      [id, itemId]
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: "Menu item not found." });
    }

    const targetInStock = inStock !== undefined ? (inStock ? 1 : 0) : (existing.in_stock ? 0 : 1);
    const targetStock = stock !== undefined ? parseInt(stock) : existing.stock;

    await db.execute(
      "UPDATE menu_items SET in_stock = ?, stock = ? WHERE restaurant_id = ? AND id = ?;",
      [targetInStock, targetStock, id, itemId]
    );

    return res.json({
      success: true,
      inStock: !!targetInStock,
      stock: targetStock,
      message: `Item "${existing.title}" is now ${targetInStock ? "In Stock" : "Out of Stock (86'd)"}.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Menu Item
 */
async function deleteMenuItem(req, res, next) {
  try {
    const { id, itemId } = req.params;

    const existing = await db.queryOne(
      "SELECT * FROM menu_items WHERE restaurant_id = ? AND id = ?;",
      [id, itemId]
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: "Menu item not found." });
    }

    await db.execute("DELETE FROM menu_items WHERE restaurant_id = ? AND id = ?;", [id, itemId]);

    return res.json({
      success: true,
      message: `Item "${existing.title}" deleted from menu.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCategories,
  createCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  toggleItemStock,
  deleteMenuItem
};
