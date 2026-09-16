// server/routes/searchRoutes.js
const express = require("express");
const router = express.Router();
const { getDLPool } = require("../config/db");
const userAuth = require("../middleware/userAuth");

// =====================================================
// AUTH MIDDLEWARE
// =====================================================
//router.use(userAuth);

// =====================================================
// CONSTANTS
// =====================================================
const TABLE_PEP = "international_pep";
const TABLE_SANCTIONS = "uk_sanctions_list";

// =====================================================
// GET /api/search/all?name=<query>
// Search both tables by name (PEP + UK Sanctions)
// =====================================================
router.get("/all", async (req, res) => {
  const { name } = req.query;

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json({ success: false, error: "Please provide a name to search for" });
  }

  // Escape ILIKE wildcards in user input
  const safeTerm = String(name).trim().replace(/[%_\\]/g, "\\$&");
  const searchTerm = `%${safeTerm}%`;

  try {
    const pool = getDLPool();

    const [pepResult, sanctionsResult] = await Promise.all([
      pool.query(
        `
        SELECT *
        FROM ${TABLE_PEP}
        WHERE name ILIKE $1 OR aliases ILIKE $1
        ORDER BY name
        LIMIT 100
        `,
        [searchTerm]
      ),
      pool.query(
        `
        SELECT *
        FROM ${TABLE_SANCTIONS}
        WHERE names ILIKE $1 OR non_latin_names ILIKE $1
        ORDER BY unique_id
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