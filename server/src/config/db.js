/**
 * Plate Pilot - Unified Database Manager
 * Supports:
 *  1. SQLite (Default, embedded, zero configuration, persists to ./data/platepilot.db)
 *  2. MySQL / MariaDB (via mysql2/promise if DB_TYPE=mysql in .env)
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config();

const DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();
const SQLITE_FILE = path.resolve(__dirname, "../../data/platepilot.db");

let sqlJsDb = null;
let mysqlPool = null;

// Ensure ./data directory exists for SQLite
const dataDir = path.dirname(SQLITE_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Initialize Database Connection
 */
async function initDatabase() {
  if (DB_TYPE === "mysql" || DB_TYPE === "mariadb") {
    const mysql = require("mysql2/promise");
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "platepilot",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log(`[Database] Connected to MySQL/MariaDB at ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "3306"}`);
    return;
  }

  // SQLite via sql.js
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();

  if (fs.existsSync(SQLITE_FILE)) {
    const fileBuffer = fs.readFileSync(SQLITE_FILE);
    sqlJsDb = new SQL.Database(fileBuffer);
    console.log(`[Database] Loaded existing SQLite database from ${SQLITE_FILE}`);
  } else {
    sqlJsDb = new SQL.Database();
    saveSqliteToDisk();
    console.log(`[Database] Created new SQLite database at ${SQLITE_FILE}`);
  }
}

/**
 * Persist SQLite database state to disk
 */
function saveSqliteToDisk() {
  if (sqlJsDb) {
    try {
      const data = sqlJsDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(SQLITE_FILE, buffer);
    } catch (err) {
      console.error("[Database] Failed to write SQLite file:", err.message);
    }
  }
}

/**
 * Normalize params for sql.js (converts booleans and dates to primitives)
 */
function normalizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(val => {
    if (typeof val === "boolean") return val ? 1 : 0;
    if (val instanceof Date) return val.toISOString();
    if (val === undefined) return null;
    return val;
  });
}

/**
 * Execute SELECT query and return array of objects
 */
async function query(sql, params = []) {
  if (mysqlPool) {
    const [rows] = await mysqlPool.query(sql, params);
    return rows;
  }

  if (!sqlJsDb) await initDatabase();
  const cleanParams = normalizeParams(params);
  
  const stmt = sqlJsDb.prepare(sql);
  stmt.bind(cleanParams);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Execute SELECT query and return the first row or null
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute INSERT, UPDATE, DELETE query
 */
async function execute(sql, params = []) {
  if (mysqlPool) {
    const [result] = await mysqlPool.execute(sql, params);
    return {
      changes: result.affectedRows,
      lastInsertRowid: result.insertId
    };
  }

  if (!sqlJsDb) await initDatabase();
  const cleanParams = normalizeParams(params);

  try {
    sqlJsDb.run(sql, cleanParams);
    saveSqliteToDisk();

    // Query last insert id if any
    let lastId = 0;
    try {
      const res = sqlJsDb.exec("SELECT last_insert_rowid() AS id;");
      if (res.length > 0 && res[0].values.length > 0) {
        lastId = res[0].values[0][0];
      }
    } catch (_) {}

    return {
      changes: sqlJsDb.getRowsModified(),
      lastInsertRowid: lastId
    };
  } catch (err) {
    throw new Error(`Database execute error: ${err.message} (SQL: ${sql})`);
  }
}

/**
 * Execute multiple statements (DDL schema migration)
 */
async function execScript(sqlScript) {
  if (mysqlPool) {
    const stmts = sqlScript.split(";").map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of stmts) {
      await mysqlPool.query(stmt);
    }
    return;
  }

  if (!sqlJsDb) await initDatabase();
  sqlJsDb.exec(sqlScript);
  saveSqliteToDisk();
}

module.exports = {
  initDatabase,
  query,
  queryOne,
  execute,
  execScript,
  saveSqliteToDisk,
  getDbInstance: () => sqlJsDb || mysqlPool
};
