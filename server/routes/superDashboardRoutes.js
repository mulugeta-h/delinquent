const express = require("express");
const router = express.Router();
const { getDLPool } = require("../config/db");

const pool = getDLPool();

router.get("/dashboard", async (req, res) => {
  try {
    // NEW CORE DATA
    
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Dashboard fetch failed",
      error: err.message,
    });
  }
});

module.exports = router;