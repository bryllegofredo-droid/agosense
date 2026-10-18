/**
 * =====================================================================================
 * Agosense Backend Server & REST API (Supabase-Ready)
 * =====================================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { insertTelemetry, getLatestBySite, getHistory, getStatistics, clearSimulatedRecords, exportCSV } = require('./db');
const { getStandards, setStandards, evaluateWAWQI } = require('./wawqi');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Optional Gateway Security Middleware
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;

function checkGatewayAuth(req, res, next) {
  if (!GATEWAY_API_KEY) return next(); // No key enforced if unset
  const authHeader = req.headers['x-gateway-auth'];
  if (authHeader !== GATEWAY_API_KEY) {
    return res.status(401).json({ error: "Unauthorized gateway packet: Invalid X-Gateway-Auth token" });
  }
  next();
}

// ==========================================
// API ROUTES
// ==========================================

/**
 * 1. Telemetry Ingestion (from Heltec LoRa Gateway)
 * POST /api/telemetry
 */
app.post('/api/telemetry', checkGatewayAuth, async (req, res) => {
  try {
    const data = req.body;
    data.is_simulated = false; // Authentic hardware LoRa packet
    console.log(`[INGEST] Packet received from site=${data.site || 'UNKNOWN'} seq=${data.seq || 'N/A'}`);

    if (data.ph === undefined && data.temp === undefined && data.tds === undefined) {
      return res.status(400).json({ error: "Missing required sensor telemetry fields" });
    }

    const savedRecord = await insertTelemetry(data);
    res.status(201).json({
      status: "success",
      id: savedRecord.id,
      wawqi: savedRecord.wawqi,
      classification: savedRecord.classification,
      dominantParameter: savedRecord.dominantParameter
    });
  } catch (err) {
    console.error("Telemetry ingestion error:", err);
    res.status(500).json({ error: "Internal server error during ingestion" });
  }
});

/**
 * 2. Get latest telemetry per station
 * GET /api/latest
 */
app.get('/api/latest', async (req, res) => {
  try {
    const latest = await getLatestBySite();
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Get history (time series)
 * GET /api/history?site=UPSTREAM&limit=50
 */
app.get('/api/history', async (req, res) => {
  try {
    const site = req.query.site || null;
    const limit = req.query.limit || 100;
    const filter = req.query.filter || null; // 'real', 'simulated', or null/all
    const records = await getHistory(site, limit, filter);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Get statistical aggregates & compliance rates
 * GET /api/stats?site=UPSTREAM
 */
app.get('/api/stats', async (req, res) => {
  try {
    const site = req.query.site || null;
    const stats = await getStatistics(site);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Standards endpoints
 */
app.get('/api/standards', (req, res) => {
  res.json(getStandards());
});

app.post('/api/standards', (req, res) => {
  try {
    const updated = setStandards(req.body);
    res.json({ status: "success", standards: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 6. Quick on-the-fly evaluation calculator
 * POST /api/wawqi/calculate
 */
app.post('/api/wawqi/calculate', (req, res) => {
  try {
    const { ph, temp, turbidity, tds } = req.body;
    const result = evaluateWAWQI({
      ph: Number(ph),
      temp: Number(temp),
      turbidity: Number(turbidity),
      tds: Number(tds)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 7. Telemetry Simulator
 * POST /api/simulate
 */
app.post('/api/simulate', async (req, res) => {
  try {
    const sites = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM"];
    const targetSite = req.body.site || sites[Math.floor(Math.random() * sites.length)];

    let baseTemp = 26.5 + (Math.random() * 2.0 - 1.0);
    let basePh = 7.3 + (Math.random() * 0.4 - 0.2);
    let baseTurb = 3.5 + (Math.random() * 2.0);
    let baseTds = 120 + Math.random() * 40;

    if (targetSite === "MIDSTREAM") {
      baseTemp += 0.8;
      basePh += 0.3;
      baseTurb = 6.8 + (Math.random() * 3.5);
      baseTds = 210 + Math.random() * 80;
    } else if (targetSite === "DOWNSTREAM") {
      baseTemp += 1.4;
      basePh += 0.5;
      baseTurb = 11.2 + (Math.random() * 6.0);
      baseTds = 340 + Math.random() * 110;
    }

    const sample = {
      site: targetSite,
      node_id: targetSite === "UPSTREAM" ? 1 : targetSite === "MIDSTREAM" ? 2 : 3,
      temp: Number(baseTemp.toFixed(1)),
      ph: Number(basePh.toFixed(2)),
      turb_ntu: Number(baseTurb.toFixed(1)),
      turb_v: Number(((baseTurb / 10.0) + 1.2).toFixed(2)),
      tds: Number(baseTds.toFixed(0)),
      rssi: -65 - Math.floor(Math.random() * 25),
      snr: Number((7.0 + Math.random() * 4.0).toFixed(1)),
      freq_error: Math.floor(Math.random() * 1800 - 900),
      pdr: Number((96.0 + Math.random() * 4.0).toFixed(1)),
      packet_loss: Math.floor(Math.random() * 3),
      batt_v: Number((3.85 + Math.random() * 0.3).toFixed(2)),
      tx_pwr: 17,
      is_simulated: true // Explicitly tagged test data
    };

    const record = await insertTelemetry(sample);
    res.json({ status: "simulated", record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. Clear Simulated Test Data
 * POST /api/clear-simulated
 */
app.post('/api/clear-simulated', async (req, res) => {
  try {
    const result = await clearSimulatedRecords();
    res.json({
      status: "success",
      deletedCount: result.deletedCount,
      message: `Successfully cleared ${result.deletedCount} simulated test record(s).`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. CSV Data Export
 * GET /api/export/csv
 */
app.get('/api/export/csv', async (req, res) => {
  try {
    const site = req.query.site || null;
    const filter = req.query.filter || 'all'; // 'real', 'simulated', or 'all'
    const csvContent = await exportCSV(site, filter);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="agosense_water_quality_${filter}_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server locally (Vercel serverless will invoke exported app)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Agosense Server running on port ${PORT}`);
    console.log(`📡 Ingestion endpoint: http://localhost:${PORT}/api/telemetry`);
    console.log(`📊 Web Dashboard:      http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;

