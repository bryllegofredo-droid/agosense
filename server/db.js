/**
 * =====================================================================================
 * Agosense Telemetry Store (Supabase Cloud + Local Fallback)
 * =====================================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { evaluateWAWQI } = require('./wawqi');

// Supabase Client Initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project-ref')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(` Connected to Supabase Project: ${supabaseUrl}`);
  } catch (err) {
    console.warn("⚠️ Failed to initialize Supabase client, using local fallback:", err.message);
  }
} else {
  console.log("ℹ️ No Supabase credentials found in .env. Operating in local JSON mode.");
}

// Local Fallback Storage
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'telemetry.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
} catch (err) {
  // Graceful fallback for serverless read-only filesystems
}

function loadLocalRecords() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveLocalRecords(records) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Local file write error:', err);
  }
}

/**
 * Inserts telemetry reading into Supabase (and mirrors locally)
 */
async function insertTelemetry(packet) {
  const ph = Number(packet.ph || 7.0);
  const temp = Number(packet.temp || 25.0);
  const turbidity = Number(packet.turb_ntu !== undefined ? packet.turb_ntu : (packet.turbidity || 0));
  const tds = Number(packet.tds || 0);

  // Compute WAWQI metrics mathematically
  const wqiResult = evaluateWAWQI({ ph, temp, turbidity, tds });

  const record = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: packet.timestamp || new Date().toISOString(),
    site: (packet.site || "UPSTREAM").toUpperCase(),
    node_id: packet.node_id || 1,
    seq: packet.seq || 1,
    temp,
    ph,
    turb_v: packet.turb_v || 0,
    turbidity,
    tds,
    rssi: packet.rssi !== undefined ? Number(packet.rssi) : null,
    snr: packet.snr !== undefined ? Number(packet.snr) : null,
    freq_error: packet.freq_error !== undefined ? Number(packet.freq_error) : 0,
    pdr: packet.pdr !== undefined ? Number(packet.pdr) : 100.0,
    packet_loss: packet.packet_loss !== undefined ? Number(packet.packet_loss) : 0,
    batt_v: packet.batt_v !== undefined ? Number(packet.batt_v) : null,
    tx_pwr: packet.tx_pwr !== undefined ? Number(packet.tx_pwr) : 17,
    path_loss: (packet.tx_pwr !== undefined && packet.rssi !== undefined) ? Number(packet.tx_pwr) - Number(packet.rssi) : null,
    wawqi: wqiResult.wawqi,
    classification: wqiResult.classification,
    classColor: wqiResult.classColor,
    classBadge: wqiResult.classBadge,
    dominantParameter: wqiResult.dominantParameter,
    dominantContributionPct: wqiResult.dominantContributionPct,
    subIndices: wqiResult.subIndices,
    contributionPercentages: wqiResult.contributionPercentages,
    qualityRatings: wqiResult.qualityRatings,
    compliance: wqiResult.compliance,
    is_simulated: packet.is_simulated === true || packet.verified_hardware !== true,
    verified_hardware: Boolean(packet.verified_hardware === true)
  };

  // Always mirror locally
  const localRecords = loadLocalRecords();
  localRecords.unshift(record);
  saveLocalRecords(localRecords);

  // If Supabase is connected, insert row into Supabase 'telemetry_logs' table
  if (supabase) {
    try {
      const { error } = await supabase.from('telemetry_logs').insert([{
        timestamp: record.timestamp,
        station_id: record.site,
        packet_seq: record.seq,
        ph_value: record.ph,
        temp_celsius: record.temp,
        turbidity_voltage: record.turb_v,
        turbidity_ntu: record.turbidity,
        tds_ppm: record.tds,
        wawqi_score: record.wawqi,
        classification: record.classification,
        dominant_parameter: record.dominantParameter,
        dominant_contribution_pct: record.dominantContributionPct,
        subindex_ph: record.subIndices.pH,
        subindex_temp: record.subIndices.temperature,
        subindex_turbidity: record.subIndices.turbidity,
        subindex_tds: record.subIndices.tds,
        quality_ph: record.qualityRatings.pH,
        quality_temp: record.qualityRatings.temperature,
        quality_turbidity: record.qualityRatings.turbidity,
        quality_tds: record.qualityRatings.tds,
        rssi_dbm: record.rssi,
        snr_db: record.snr
      }]);

      if (error) {
        console.warn('⚠️ Supabase insert warning:', error.message);
      } else {
        console.log(` Synced packet to Supabase [${record.site} #${record.seq}]`);
      }
    } catch (err) {
      console.error('Supabase communication error:', err.message);
    }
  }

  return record;
}

/**
 * Returns latest telemetry for each station
 */
async function getLatestBySite() {
  const sites = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM"];
  const result = {};

  if (supabase) {
    try {
      for (const site of sites) {
        const { data, error } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('station_id', site)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const row = data[0];
          result[site] = mapSupabaseRowToTelemetry(row);
        } else {
          result[site] = null;
        }
      }
      return result;
    } catch (err) {
      console.warn("Falling back to local records for getLatestBySite");
    }
  }

  // Local fallback
  const local = loadLocalRecords();
  sites.forEach(site => {
    result[site] = local.find(r => r.site === site) || null;
  });
  return result;
}

/**
 * Returns telemetry history
 */
async function getHistory(site = null, limit = 100, filter = null) {
  let records = [];
  if (supabase) {
    try {
      let query = supabase
        .from('telemetry_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(Number(limit));

      if (site && site.toUpperCase() !== "ALL") {
        query = query.eq('station_id', site.toUpperCase());
      }

      if (filter === 'real') {
        query = query.neq('is_simulated', true);
      } else if (filter === 'simulated') {
        query = query.eq('is_simulated', true);
      }

      const { data, error } = await query;
      if (!error && data) {
        records = data.map(mapSupabaseRowToTelemetry);
      }
    } catch (err) {
      console.warn("Falling back to local records for getHistory");
    }
  }

  // Local fallback
  if (!records.length) {
    records = loadLocalRecords();
    if (site && site.toUpperCase() !== "ALL") {
      records = records.filter(r => r.site === site.toUpperCase());
    }
  }

  if (filter === 'real') {
    records = records.filter(r => !r.is_simulated);
  } else if (filter === 'simulated') {
    records = records.filter(r => Boolean(r.is_simulated));
  }

  return records.slice(0, Number(limit));
}

/**
 * Clears all simulated test records from local storage and Supabase
 */
async function clearSimulatedRecords() {
  const local = loadLocalRecords();
  const originalCount = local.length;
  // Preserve ONLY packets confirmed from physical LoRa gateway hardware
  const purged = local.filter(r => r.verified_hardware === true && r.is_simulated === false);
  saveLocalRecords(purged);
  const deletedCount = originalCount - purged.length;

  if (supabase) {
    try {
      // Clear all test/simulated records from Supabase
      const { error } = await supabase.from('telemetry_logs').delete().neq('id', 0);
      if (error) {
        console.warn('⚠️ Supabase clear warning:', error.message);
      }
    } catch (err) {
      console.warn('Supabase delete error:', err.message);
    }
  }

  return { deletedCount: deletedCount >= 0 ? deletedCount : originalCount };
}

/**
 * Computes descriptive statistics
 */
async function getStatistics(site = null) {
  const records = await getHistory(site, 2000);
  if (records.length === 0) {
    return { count: 0, sites: ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM"] };
  }

  function statsFor(key) {
    const values = records.map(r => r[key]).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return {
      mean: Number(mean.toFixed(2)),
      std: Number(Math.sqrt(variance).toFixed(2)),
      min: Number(Math.min(...values).toFixed(2)),
      max: Number(Math.max(...values).toFixed(2))
    };
  }

  let phCompliant = 0;
  let tempCompliant = 0;
  let turbCompliant = 0;
  let tdsCompliant = 0;

  records.forEach(r => {
    if (r.compliance?.pH) phCompliant++;
    if (r.compliance?.temperature) tempCompliant++;
    if (r.compliance?.turbidity) turbCompliant++;
    if (r.compliance?.tds) tdsCompliant++;
  });

  const total = records.length;

  return {
    count: total,
    metrics: {
      wawqi: statsFor('wawqi'),
      ph: statsFor('ph'),
      temperature: statsFor('temp'),
      turbidity: statsFor('turbidity'),
      tds: statsFor('tds')
    },
    complianceRates: {
      pH: Number(((phCompliant / total) * 100).toFixed(1)),
      temperature: Number(((tempCompliant / total) * 100).toFixed(1)),
      turbidity: Number(((turbCompliant / total) * 100).toFixed(1)),
      tds: Number(((tdsCompliant / total) * 100).toFixed(1))
    }
  };
}

/**
 * Helper to map Supabase database columns back to frontend telemetry object
 */
function mapSupabaseRowToTelemetry(row) {
  const wqiResult = evaluateWAWQI({
    ph: Number(row.ph_value),
    temp: Number(row.temp_celsius),
    turbidity: Number(row.turbidity_ntu),
    tds: Number(row.tds_ppm)
  });

  return {
    id: `db_${row.id}`,
    timestamp: row.timestamp,
    site: row.station_id,
    node_id: row.station_id === "UPSTREAM" ? 1 : row.station_id === "MIDSTREAM" ? 2 : 3,
    seq: row.packet_seq,
    temp: Number(row.temp_celsius),
    ph: Number(row.ph_value),
    turb_v: Number(row.turbidity_voltage || 0),
    turbidity: Number(row.turbidity_ntu),
    tds: Number(row.tds_ppm),
    rssi: row.rssi_dbm,
    snr: row.snr_db ? Number(row.snr_db) : null,
    wawqi: Number(row.wawqi_score),
    classification: row.classification,
    classColor: wqiResult.classColor,
    classBadge: wqiResult.classBadge,
    dominantParameter: row.dominant_parameter,
    dominantContributionPct: Number(row.dominant_contribution_pct),
    subIndices: wqiResult.subIndices,
    contributionPercentages: wqiResult.contributionPercentages,
    qualityRatings: wqiResult.qualityRatings,
    compliance: wqiResult.compliance,
    is_simulated: row.is_simulated === true || row.verified_hardware !== true,
    verified_hardware: Boolean(row.verified_hardware === true)
  };
}

/**
 * CSV Export
 */
async function exportCSV(site = null, filter = 'all') {
  const records = await getHistory(site, 5000, filter);
  const pins = (await getPins())
    .filter(p => p.site)
    .map(p => ({ ...p, t: new Date(p.created_at).getTime() }))
    .sort((a, b) => a.t - b.t);

  // Match each reading to the map pin of the same station that was active when it was recorded
  // (latest pin created at/before the reading; otherwise the earliest pin for that station).
  function pinFor(record) {
    const sitePins = pins.filter(p => p.site === record.site);
    if (!sitePins.length) return null;
    const t = new Date(record.timestamp).getTime();
    let match = null;
    for (const p of sitePins) {
      if (p.t <= t) match = p; else break;
    }
    return match || sitePins[0];
  }

  const headers = [
    "Timestamp", "Location", "Latitude", "Longitude", "Pin_Label", "Sequence", "pH", "Temp_C", "Turbidity_NTU",
    "TDS_ppm", "WAWQI", "Classification", "Dominant_Parameter", "Battery_V", "RSSI_dBm", "SNR_dB", "Data_Source"
  ];

  const rows = records.map(r => {
    const pin = pinFor(r);
    return [
      r.timestamp,
      `"${r.site}"`,
      pin ? Number(pin.lat).toFixed(6) : "",
      pin ? Number(pin.lng).toFixed(6) : "",
      pin ? `"${String(pin.label).replace(/"/g, '""')}"` : "",
      r.seq,
      r.ph,
      r.temp,
      r.turbidity,
      r.tds,
      r.wawqi,
      `"${r.classification}"`,
      `"${r.dominantParameter}"`,
      r.batt_v !== null && r.batt_v !== undefined ? r.batt_v : "",
      r.rssi !== null ? r.rssi : "",
      r.snr !== null ? r.snr : "",
      r.is_simulated ? "SIMULATED_TEST" : "REAL_LORA_PROTOTYPE"
    ];
  });

  return [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
}

/**
 * ==========================================
 * Sample location pins (map)
 * Supabase table: sample_pins  (see DEPLOYMENT_AND_DATABASE_GUIDE.md / SQL in README of this change)
 * Falls back to data/pins.json when Supabase is unavailable.
 * ==========================================
 */
const PINS_FILE = path.join(DATA_DIR, 'pins.json');

function loadLocalPins() {
  try {
    return JSON.parse(fs.readFileSync(PINS_FILE, 'utf-8'));
  } catch (err) {
    return [];
  }
}

function saveLocalPins(pins) {
  try {
    fs.writeFileSync(PINS_FILE, JSON.stringify(pins, null, 2), 'utf-8');
  } catch (err) {
    console.error('Local pins write error:', err.message);
  }
}

async function getPins() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sample_pins')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) return data;
      if (error) console.warn('⚠️ Supabase pins read warning:', error.message);
    } catch (err) {
      console.warn('Supabase pins read error:', err.message);
    }
  }
  return loadLocalPins();
}

async function addPin({ lat, lng, label, site, note }) {
  const pin = {
    lat: Number(lat),
    lng: Number(lng),
    label: String(label || 'Sample point').slice(0, 80),
    site: site ? String(site).slice(0, 20).toUpperCase() : null,
    note: note ? String(note).slice(0, 300) : null
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.from('sample_pins').insert([pin]).select().single();
      if (!error && data) return data;
      if (error) console.warn('⚠️ Supabase pins insert warning:', error.message);
    } catch (err) {
      console.warn('Supabase pins insert error:', err.message);
    }
  }

  const local = loadLocalPins();
  const saved = { id: `pin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, ...pin, created_at: new Date().toISOString() };
  local.push(saved);
  saveLocalPins(local);
  return saved;
}

async function deletePin(id) {
  if (supabase) {
    try {
      const { error } = await supabase.from('sample_pins').delete().eq('id', id);
      if (error) console.warn('⚠️ Supabase pins delete warning:', error.message);
    } catch (err) {
      console.warn('Supabase pins delete error:', err.message);
    }
  }
  const local = loadLocalPins();
  saveLocalPins(local.filter(p => String(p.id) !== String(id)));
  return { deleted: true };
}

module.exports = {
  insertTelemetry,
  getLatestBySite,
  getHistory,
  getStatistics,
  clearSimulatedRecords,
  exportCSV,
  getPins,
  addPin,
  deletePin
};
