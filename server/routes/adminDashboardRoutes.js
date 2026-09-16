// routes/adminDashboardRoutes.js
const express = require('express');
const router = express.Router();
const { getDLPool } = require("../config/db");
const userAuth = require("../middleware/userAuth");

// Apply userAuth middleware to all routes
router.use(userAuth);

// =====================================================
// ADMIN DASHBOARD STATS
// =====================================================
router.get("/stats", async (req, res) => {
    console.log("=== Admin Dashboard Stats API Called ===");
    //console.log("User:", req.user);
   try{

    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data',
            error: error.message
        });
    }
});

module.exports = router;