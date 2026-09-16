require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { connectDB } = require("./config/db");
const initDB = require("./config/init");

const app = express();

app.use(
  helmet({
    frameguard: { action: "deny" },
  })
);

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/adminDashboard", require("./routes/adminDashboardRoutes"));
app.use("/api/superDashboard", require("./routes/superDashboardRoutes"));
app.use("/api/admin", require("./routes/superAdminRoutes"));
app.use("/api/search", require("./routes/searchRoutes"));

// International PEP list (only route for now)
app.use("/api/list/pep", require("./routes/internationalPepRoutes"));

// ⏸️ UK Sanctions — uncomment when ready
app.use("/api/list/sanctions", require("./routes/UKSanctionsRoutes"));

app.get("/", (req, res) => {
  res.json({ msg: "DLIST running" });
});

async function start() {
  try {
    await initDB();
    await connectDB();

    app.listen(process.env.PORT || 5080, "0.0.0.0", () => {
      console.log(`🚀 DLIST server running on port ${process.env.PORT || 5080}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();