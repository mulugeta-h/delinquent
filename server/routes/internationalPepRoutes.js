// routes/internationalPepRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { getDLPool } = require("../config/db");
const userAuth = require("../middleware/userAuth");

router.use(userAuth);

// =========================================================
// Constants
// =========================================================
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_ROWS = 10_000_000;
const CHUNK_SIZE = 3_500;
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const TABLE = "international_pep";
const TABLE_SANCTIONS = "uk_sanctions_list";

// =========================================================
// Multer
// =========================================================
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        new Error(
          `Only ${ALLOWED_EXTENSIONS.join(", ")} files are allowed for International PEP`
        )
      );
    }
    cb(null, true);
  },
});

// =========================================================
// Helpers
// =========================================================
const toStr = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  return String(v).trim() || null;
};

const toDate = (v) => {
  if (!v) return null;
  const str = String(v).trim();
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return str;
};

const buildRowGetter = (row) => {
  const keyMap = new Map();
  for (const k of Object.keys(row)) {
    keyMap.set(k.toLowerCase().replace(/[\s_]/g, ""), k);
  }
  return (...candidates) => {
    for (const c of candidates) {
      const norm = String(c).toLowerCase().replace(/[\s_]/g, "");
      const realKey = keyMap.get(norm);
      if (realKey !== undefined) {
        const v = row[realKey];
        if (v !== undefined && v !== null && v !== "") return v;
      }
    }
    return null;
  };
};

function parseSpreadsheet(filePath, ext) {
  let workbook;
  if (ext === ".xlsx") {
    workbook = XLSX.readFile(filePath, { cellDates: true, codepage: 65001 });
  } else {
    const text = fs.readFileSync(filePath, "utf8");
    workbook = XLSX.read(text, {
      type: "string",
      cellDates: true,
      codepage: 65001,
    });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in file");

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  if (rows.length > MAX_ROWS) {
    throw new Error(`File has too many rows (${rows.length}). Max: ${MAX_ROWS}`);
  }
  return rows;
}

async function bulkUpsert(client, records) {
  const COLS = 16;
  let total = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    const placeholders = chunk
      .map(
        (_, ri) =>
          `(${Array.from(
            { length: COLS },
            (_, c) => `$${ri * COLS + c + 1}`
          ).join(",")})`
      )
      .join(",");

    const flat = chunk.flat();

    const sql = `
      INSERT INTO ${TABLE} (
        id, schema, name, aliases, birth_date, countries, addresses,
        identifiers, sanctions, phones, emails, program_id, dataset,
        first_seen, last_seen, last_change
      ) VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET
        schema       = EXCLUDED.schema,
        name         = EXCLUDED.name,
        aliases      = EXCLUDED.aliases,
        birth_date   = EXCLUDED.birth_date,
        countries    = EXCLUDED.countries,
        addresses    = EXCLUDED.addresses,
        identifiers  = EXCLUDED.identifiers,
        sanctions    = EXCLUDED.sanctions,
        phones       = EXCLUDED.phones,
        emails       = EXCLUDED.emails,
        program_id   = EXCLUDED.program_id,
        dataset      = EXCLUDED.dataset,
        first_seen   = EXCLUDED.first_seen,
        last_seen    = EXCLUDED.last_seen,
        last_change  = EXCLUDED.last_change
    `;

    const result = await client.query(sql, flat);
    total += result.rowCount;
  }

  return total;
}

// =========================================================
// GET /api/list/pep
// =========================================================
router.get("/", async (_req, res) => {
  try {
    const pool = getDLPool();
    const { rows } = await pool.query(
      `SELECT
         id, name, countries, birth_date, dataset, schema,
         last_seen, last_change
       FROM ${TABLE}
       ORDER BY id
       LIMIT 100`
    );

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      position: null,
      country: r.countries,
      dateOfBirth: r.birth_date,
      source: r.dataset || r.schema,
      status: "Active",
      uploadedAt: r.last_seen || r.last_change,
    }));

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("GET /api/list/pep error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch PEP list" });
  }
});

// =========================================================
// POST /api/list/pep/upload
// =========================================================
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  const cleanup = () => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("Failed to remove temp file:", filePath, e.message);
    }
  };

  try {
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    const rows = parseSpreadsheet(filePath, ext);
    if (rows.length === 0) throw new Error("No rows found in file");

    const records = [];
    let skipped = 0;

    for (const raw of rows) {
      const get = buildRowGetter(raw);
      const id = toStr(get("id", "ID", "unique_id", "UniqueID"));
      if (!id) {
        skipped++;
        continue;
      }

      records.push([
        id,
        toStr(get("schema", "Schema")),
        toStr(get("name", "Name", "PrimaryName", "primary_name")),
        toStr(get("aliases", "Aliases")),
        toStr(get("birth_date", "BirthDate", "birthDate", "date_of_birth")),
        toStr(get("countries", "Countries", "country")),
        toStr(get("addresses", "Addresses", "address")),
        toStr(get("identifiers", "Identifiers")),
        toStr(get("sanctions", "Sanctions")),
        toStr(get("phones", "Phones", "PhoneNumbers")),
        toStr(get("emails", "Emails", "EmailAddresses")),
        toStr(get("program_id", "ProgramID", "programId")),
        toStr(get("dataset", "Dataset")),
        toDate(get("first_seen", "FirstSeen", "DateDesignated")),
        toDate(get("last_seen", "LastSeen", "LastUpdated")),
        toDate(get("last_change", "LastChange")),
      ]);
    }

    if (records.length === 0) {
      throw new Error(
        `No valid rows to insert. Skipped ${skipped} row(s) missing required 'id'`
      );
    }

    const pool = getDLPool();
    const client = await pool.connect();
    let inserted = 0;

    try {
      await client.query("BEGIN");
      inserted = await bulkUpsert(client, records);
      await client.query("COMMIT");
    } catch (dbErr) {
      await client.query("ROLLBACK");
      throw dbErr;
    } finally {
      client.release();
    }

    cleanup();

    res.json({
      success: true,
      message: `International PEP list updated: ${inserted} record(s)`,
      recordsProcessed: inserted,
      recordsSkipped: skipped,
      totalRows: rows.length,
    });
  } catch (err) {
    console.error("PEP upload error:", err.message);
    cleanup();
    res.status(500).json({
      success: false,
      message: err.message || "Failed to process file",
    });
  }
});

// =========================================================
// GET /api/list/pep/search?name=<query>
// =========================================================
// Searches BOTH international_pep and uk_sanctions_list by name.
// Kept here so the frontend can call it under the same mounted router.
// =========================================================
router.get("/search", async (req, res) => {
  const { name } = req.query;

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json({ success: false, error: "Please provide a name to search for" });
  }

  const searchTerm = `%${String(name).trim()}%`;

  try {
    const pool = getDLPool();

    const [pepResult, sanctionsResult] = await Promise.all([
      pool.query(
        `
        SELECT * 
        FROM ${TABLE}
        WHERE name ILIKE $1 OR aliases ILIKE $1
        LIMIT 100
        `,
        [searchTerm]
      ),
      pool.query(
        `
        SELECT *
        FROM ${TABLE_SANCTIONS}
        WHERE names ILIKE $1 OR non_latin_names ILIKE $1
        LIMIT 100
        `,
        [searchTerm]
      ),
    ]);

    res.status(200).json({
      success: true,
      International_PEPs: pepResult.rows,
      UK_Sanctions_List: sanctionsResult.rows,
    });
  } catch (err) {
    console.error("Error searching data:", err);
    res
      .status(500)
      .json({ success: false, error: "Internal server error during search" });
  }
});

module.exports = router;