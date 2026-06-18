/**
 * DB Connect Pro — Real Backend Server
 * Supports: PostgreSQL, MySQL, SQLite, MongoDB, Redis
 * Node.js + Express
 */

const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// ── Connection store (in-memory per session) ──────────────────────────────
const connections = new Map();

// ── Health ────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true, version: "1.0.0" }));

// ══════════════════════════════════════════════════════════════════════════
// CONNECT
// ══════════════════════════════════════════════════════════════════════════
app.post("/api/connect", async (req, res) => {
  const { id, type, config } = req.body;
  try {
    let client;

    if (type === "postgresql") {
      const { Client } = require("pg");
      client = new Client({
        host: config.host || "localhost",
        port: parseInt(config.port) || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl === "true" ? { rejectUnauthorized: false } : false,
      });
      await client.connect();
      connections.set(id, { type, client });
    }

    else if (type === "mysql") {
      const mysql = require("mysql2/promise");
      client = await mysql.createConnection({
        host: config.host || "localhost",
        port: parseInt(config.port) || 3306,
        database: config.database,
        user: config.username,
        password: config.password,
      });
      connections.set(id, { type, client });
    }

    else if (type === "sqlite") {
      const Database = require("better-sqlite3");
      client = new Database(config.filename || ":memory:");
      connections.set(id, { type, client });
    }

    else if (type === "mongodb") {
      const { MongoClient } = require("mongodb");
      client = new MongoClient(config.uri || `mongodb://${config.host}:27017`);
      await client.connect();
      connections.set(id, { type, client, dbName: config.database });
    }

    else if (type === "redis") {
      const { createClient } = require("redis");
      client = createClient({
        socket: { host: config.host || "localhost", port: parseInt(config.port) || 6379 },
        password: config.password || undefined,
        database: parseInt(config.db_number) || 0,
      });
      await client.connect();
      connections.set(id, { type, client });
    }

    else {
      return res.status(400).json({ error: `نوع قاعدة البيانات غير مدعوم: ${type}` });
    }

    res.json({ ok: true, message: `تم الاتصال بـ ${type} بنجاح` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DISCONNECT
// ══════════════════════════════════════════════════════════════════════════
app.post("/api/disconnect", async (req, res) => {
  const { id } = req.body;
  const conn = connections.get(id);
  if (!conn) return res.json({ ok: true });
  try {
    if (conn.type === "postgresql") await conn.client.end();
    else if (conn.type === "mysql") await conn.client.end();
    else if (conn.type === "sqlite") conn.client.close();
    else if (conn.type === "mongodb") await conn.client.close();
    else if (conn.type === "redis") await conn.client.quit();
    connections.delete(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LIST TABLES / COLLECTIONS
// ══════════════════════════════════════════════════════════════════════════
app.get("/api/:id/tables", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });

  try {
    let tables = [];

    if (conn.type === "postgresql") {
      const r = await conn.client.query(
        `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
         FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`
      );
      tables = r.rows.map(r => ({ name: r.table_name, size: r.size }));
    }

    else if (conn.type === "mysql") {
      const [rows] = await conn.client.execute(
        `SELECT table_name as name, ROUND((data_length + index_length)/1024, 1) as size_kb
         FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
      );
      tables = rows.map(r => ({ name: r.name, size: r.size_kb + " KB" }));
    }

    else if (conn.type === "sqlite") {
      const rows = conn.client.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      ).all();
      tables = rows.map(r => ({ name: r.name, size: "—" }));
    }

    else if (conn.type === "mongodb") {
      const db = conn.client.db(conn.dbName);
      const cols = await db.listCollections().toArray();
      tables = cols.map(c => ({ name: c.name, size: "—", type: "collection" }));
    }

    else if (conn.type === "redis") {
      const info = await conn.client.info("keyspace");
      tables = [{ name: "keyspace", size: "—", info }];
    }

    res.json({ tables });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TABLE SCHEMA
// ══════════════════════════════════════════════════════════════════════════
app.get("/api/:id/schema/:table", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });
  const table = req.params.table;

  try {
    let columns = [];

    if (conn.type === "postgresql") {
      const r = await conn.client.query(`
        SELECT c.column_name as name, c.data_type as type,
               c.is_nullable, c.column_default,
               CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1 ORDER BY c.ordinal_position`, [table]);
      columns = r.rows;
    }

    else if (conn.type === "mysql") {
      const [rows] = await conn.client.execute(`
        SELECT COLUMN_NAME as name, COLUMN_TYPE as type,
               IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default,
               COLUMN_KEY = 'PRI' as is_pk
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ORDINAL_POSITION`, [table]);
      columns = rows;
    }

    else if (conn.type === "sqlite") {
      const rows = conn.client.prepare(`PRAGMA table_info(${table})`).all();
      columns = rows.map(r => ({
        name: r.name, type: r.type,
        is_nullable: r.notnull === 0 ? "YES" : "NO",
        column_default: r.dflt_value,
        is_pk: r.pk === 1
      }));
    }

    else if (conn.type === "mongodb") {
      const db = conn.client.db(conn.dbName);
      const sample = await db.collection(table).findOne();
      columns = sample ? Object.entries(sample).map(([k, v]) => ({
        name: k, type: typeof v, is_nullable: "YES", is_pk: k === "_id"
      })) : [];
    }

    res.json({ columns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TABLE DATA (with pagination)
// ══════════════════════════════════════════════════════════════════════════
app.get("/api/:id/data/:table", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });
  const table = req.params.table;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    let rows = [], total = 0;

    if (conn.type === "postgresql") {
      const countR = await conn.client.query(`SELECT COUNT(*) FROM "${table}"`);
      total = parseInt(countR.rows[0].count);
      const r = await conn.client.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [limit, offset]);
      rows = r.rows;
    }

    else if (conn.type === "mysql") {
      const [countRows] = await conn.client.execute(`SELECT COUNT(*) as c FROM \`${table}\``);
      total = countRows[0].c;
      const [dataRows] = await conn.client.execute(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [limit, offset]);
      rows = dataRows;
    }

    else if (conn.type === "sqlite") {
      total = conn.client.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
      rows = conn.client.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset);
    }

    else if (conn.type === "mongodb") {
      const db = conn.client.db(conn.dbName);
      total = await db.collection(table).countDocuments();
      rows = await db.collection(table).find().skip(offset).limit(limit).toArray();
    }

    res.json({ rows, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// EXECUTE SQL
// ══════════════════════════════════════════════════════════════════════════
app.post("/api/:id/query", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: "SQL مطلوب" });

  const start = Date.now();
  try {
    let rows = [], affected = 0, fields = [];

    if (conn.type === "postgresql") {
      const r = await conn.client.query(sql);
      rows = r.rows || [];
      affected = r.rowCount || 0;
      fields = r.fields?.map(f => f.name) || [];
    }

    else if (conn.type === "mysql") {
      const [result, fieldMeta] = await conn.client.execute(sql);
      if (Array.isArray(result)) {
        rows = result;
        fields = fieldMeta?.map(f => f.name) || [];
      } else {
        affected = result.affectedRows;
      }
    }

    else if (conn.type === "sqlite") {
      const stmt = conn.client.prepare(sql);
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        rows = stmt.all();
        if (rows.length) fields = Object.keys(rows[0]);
      } else {
        const info = stmt.run();
        affected = info.changes;
      }
    }

    else if (conn.type === "mongodb") {
      return res.status(400).json({ error: "MongoDB لا يدعم SQL — استخدم MongoDB Query Language" });
    }

    res.json({ rows, fields, affected, duration: Date.now() - start });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CREATE TABLE
// ══════════════════════════════════════════════════════════════════════════
app.post("/api/:id/create-table", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });
  const { sql } = req.body;

  try {
    if (conn.type === "postgresql") await conn.client.query(sql);
    else if (conn.type === "mysql") await conn.client.execute(sql);
    else if (conn.type === "sqlite") conn.client.exec(sql);
    else return res.status(400).json({ error: "غير مدعوم لهذا النوع" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DROP TABLE
// ══════════════════════════════════════════════════════════════════════════
app.delete("/api/:id/table/:table", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });
  const table = req.params.table;

  try {
    const sql = `DROP TABLE IF EXISTS "${table}"`;
    if (conn.type === "postgresql") await conn.client.query(sql);
    else if (conn.type === "mysql") await conn.client.execute(`DROP TABLE IF EXISTS \`${table}\``);
    else if (conn.type === "sqlite") conn.client.exec(sql);
    else if (conn.type === "mongodb") {
      const db = conn.client.db(conn.dbName);
      await db.collection(table).drop();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT SCHEMA AS SQL
// ══════════════════════════════════════════════════════════════════════════
app.get("/api/:id/export", async (req, res) => {
  const conn = connections.get(req.params.id);
  if (!conn) return res.status(404).json({ error: "الاتصال غير موجود" });

  try {
    let sql = `-- DB Connect Pro Export\n-- ${new Date().toISOString()}\n\n`;

    if (conn.type === "sqlite") {
      const tables = conn.client.prepare(
        `SELECT name FROM sqlite_master WHERE type='table'`
      ).all();
      for (const { name } of tables) {
        const def = conn.client.prepare(
          `SELECT sql FROM sqlite_master WHERE name = ?`
        ).get(name);
        if (def?.sql) sql += def.sql + ";\n\n";
      }
    }

    else if (conn.type === "postgresql") {
      const r = await conn.client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
      );
      for (const row of r.rows) {
        const cols = await conn.client.query(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
          [row.table_name]
        );
        const colDefs = cols.rows.map(c =>
          `  ${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? ` DEFAULT ${c.column_default}` : ""}`
        ).join(",\n");
        sql += `CREATE TABLE ${row.table_name} (\n${colDefs}\n);\n\n`;
      }
    }

    res.json({ sql });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => console.log(`✅ DB Connect Pro Backend — http://localhost:${PORT}`));
