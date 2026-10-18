/**
 * =====================================================================================
 * Agosense WAWQI Calculation Engine
 * 
 * Based on:
 * "A Mathematical Framework for Agosense: IoT-Based, Machine-Learning-Integrated
 * Multi-Parameter Water Quality Monitoring and WAWQI Assessment of the Digos River"
 * & DENR Administrative Order (DAO) 2016-08 Water Quality Guidelines
 * =====================================================================================
 */

// Default standard values (Si) per DENR DAO 2016-08 Class C / Freshwater
// Can be customized dynamically per water body classification (Class AA, A, B, C, D)
const DEFAULT_STANDARDS = {
  name: "DENR DAO 2016-08 (Class C - Fishery / Agriculture / Recreation)",
  pH: {
    standard: 8.5,       // Upper limit standard (Acceptable range: 6.5 - 8.5)
    ideal: 7.0,          // Neutral baseline
    lowerLimit: 6.5,
    upperLimit: 8.5,
    unit: "pH"
  },
  temperature: {
    standard: 30.0,      // Max allowable guideline (Ambient + 3C or max 31C)
    ideal: 25.0,         // Reference standard baseline (or site ambient)
    unit: "°C"
  },
  turbidity: {
    standard: 5.0,       // Max permissible limit (DAO 2016-08 / WHO drinking standard)
    ideal: 0.0,
    unit: "NTU"
  },
  tds: {
    standard: 500.0,     // Max limit (mg/L / ppm) for Class AA/A/C potable/freshwater
    ideal: 0.0,
    unit: "mg/L"
  }
};

let activeStandards = JSON.parse(JSON.stringify(DEFAULT_STANDARDS));

/**
 * Calculates unit weights Wi for each parameter based on inverse standards:
 * K = 1 / sum(1 / Si)
 * Wi = K / Si, such that sum(Wi) = 1
 */
function calculateUnitWeights(standards = activeStandards) {
  const invSum = 
    (1.0 / standards.pH.standard) +
    (1.0 / standards.temperature.standard) +
    (1.0 / standards.turbidity.standard) +
    (1.0 / standards.tds.standard);

  const K = 1.0 / invSum;

  const w_pH = K / standards.pH.standard;
  const w_temp = K / standards.temperature.standard;
  const w_turb = K / standards.turbidity.standard;
  const w_tds = K / standards.tds.standard;

  return {
    K: Number(K.toFixed(4)),
    pH: Number(w_pH.toFixed(4)),
    temperature: Number(w_temp.toFixed(4)),
    turbidity: Number(w_turb.toFixed(4)),
    tds: Number(w_tds.toFixed(4)),
    sumWeights: Number((w_pH + w_temp + w_turb + w_tds).toFixed(4))
  };
}

/**
 * Computes individual quality rating Qi:
 * Qi = 100 * (Vi - V0) / (Si - V0)
 * Note for pH: uses |Vi - 7| in the numerator so both acidic (<7) and basic (>7) deviations increase Qi
 */
function calculateQualityRatings(reading, standards = activeStandards) {
  // 1. pH Quality Rating
  // Ideal V0 = 7.0. Deviation = |pH - 7|
  const phDeviation = Math.abs(reading.ph - standards.pH.ideal);
  const phRange = standards.pH.standard - standards.pH.ideal; // e.g. 8.5 - 7.0 = 1.5
  const q_pH = Math.max(0, 100 * (phDeviation / phRange));

  // 2. Temperature Quality Rating
  // V0 = 25C (or site ambient). If temp <= ideal, Qi = 0 (or slight deficit)
  const tempDeviation = Math.max(0, reading.temp - standards.temperature.ideal);
  const tempRange = standards.temperature.standard - standards.temperature.ideal; // e.g. 30 - 25 = 5C
  const q_temp = Math.max(0, 100 * (tempDeviation / tempRange));

  // 3. Turbidity Quality Rating
  // V0 = 0
  const q_turb = Math.max(0, 100 * (reading.turbidity / standards.turbidity.standard));

  // 4. TDS Quality Rating
  // V0 = 0
  const q_tds = Math.max(0, 100 * (reading.tds / standards.tds.standard));

  return {
    pH: Number(q_pH.toFixed(2)),
    temperature: Number(q_temp.toFixed(2)),
    turbidity: Number(q_turb.toFixed(2)),
    tds: Number(q_tds.toFixed(2))
  };
}

/**
 * Classifies WAWQI into water quality class based on Brown / Chatterjee-Raziuddin scale:
 * 0 - 25: Excellent
 * 26 - 50: Good
 * 51 - 75: Poor
 * 76 - 100: Very Poor
 * > 100: Unfit for Drinking
 */
function classifyWAWQI(score) {
  if (score <= 25.0) {
    return {
      class: "Excellent",
      color: "#10b981", // Emerald green
      badge: "badge-excellent",
      description: "Pristine water quality; suitable for drinking after conventional disinfection."
    };
  } else if (score <= 50.0) {
    return {
      class: "Good",
      color: "#06b6d4", // Cyan
      badge: "badge-good",
      description: "Clean water quality; acceptable for general contact and domestic use."
    };
  } else if (score <= 75.0) {
    return {
      class: "Poor",
      color: "#f59e0b", // Amber
      badge: "badge-poor",
      description: "Moderate pollution; requires treatment before any domestic consumption."
    };
  } else if (score <= 100.0) {
    return {
      class: "Very Poor",
      color: "#f97316", // Orange
      badge: "badge-very-poor",
      description: "Heavy degradation; unsuitable for domestic use without extensive purification."
    };
  } else {
    return {
      class: "Unfit for Drinking",
      color: "#ef4444", // Crimson Red
      badge: "badge-unfit",
      description: "Severe pollution; fails public health standards; dangerous for human contact."
    };
  }
}

/**
 * Main evaluation function
 * Ingests a reading: { ph, temp, turbidity, tds }
 * Returns full WAWQI breakdown, QiWi values, dominant parameter, and classification
 */
function evaluateWAWQI(reading, standards = activeStandards) {
  const weights = calculateUnitWeights(standards);
  const q = calculateQualityRatings(reading, standards);

  // Sub-index contributions Qi * Wi
  const qiwi_pH = q.pH * weights.pH;
  const qiwi_temp = q.temperature * weights.temperature;
  const qiwi_turb = q.turbidity * weights.turbidity;
  const qiwi_tds = q.tds * weights.tds;

  const totalScore = qiwi_pH + qiwi_temp + qiwi_turb + qiwi_tds;
  const roundedScore = Number(totalScore.toFixed(2));

  // Determine percentage contribution of each parameter
  const percent_pH = totalScore > 0 ? (qiwi_pH / totalScore) * 100 : 0;
  const percent_temp = totalScore > 0 ? (qiwi_temp / totalScore) * 100 : 0;
  const percent_turb = totalScore > 0 ? (qiwi_turb / totalScore) * 100 : 0;
  const percent_tds = totalScore > 0 ? (qiwi_tds / totalScore) * 100 : 0;

  // Find dominant driver
  const contributions = [
    { name: "Turbidity", pct: percent_turb, qiwi: qiwi_turb },
    { name: "pH", pct: percent_pH, qiwi: qiwi_pH },
    { name: "Temperature", pct: percent_temp, qiwi: qiwi_temp },
    { name: "TDS", pct: percent_tds, qiwi: qiwi_tds }
  ];
  contributions.sort((a, b) => b.pct - a.pct);

  // Compliance check per parameter
  const compliance = {
    pH: reading.ph >= standards.pH.lowerLimit && reading.ph <= standards.pH.upperLimit,
    temperature: reading.temp <= standards.temperature.standard,
    turbidity: reading.turbidity <= standards.turbidity.standard,
    tds: reading.tds <= standards.tds.standard
  };

  const classification = classifyWAWQI(roundedScore);

  return {
    wawqi: roundedScore,
    classification: classification.class,
    classColor: classification.color,
    classBadge: classification.badge,
    description: classification.description,
    dominantParameter: contributions[0].name,
    dominantContributionPct: Number(contributions[0].pct.toFixed(1)),
    weights: {
      K: weights.K,
      pH: weights.pH,
      temperature: weights.temperature,
      turbidity: weights.turbidity,
      tds: weights.tds
    },
    qualityRatings: q,
    subIndices: {
      pH: Number(qiwi_pH.toFixed(2)),
      temperature: Number(qiwi_temp.toFixed(2)),
      turbidity: Number(qiwi_turb.toFixed(2)),
      tds: Number(qiwi_tds.toFixed(2))
    },
    contributionPercentages: {
      pH: Number(percent_pH.toFixed(1)),
      temperature: Number(percent_temp.toFixed(1)),
      turbidity: Number(percent_turb.toFixed(1)),
      tds: Number(percent_tds.toFixed(1))
    },
    compliance
  };
}

function getStandards() {
  return activeStandards;
}

function setStandards(newStandards) {
  activeStandards = Object.assign({}, activeStandards, newStandards);
  return activeStandards;
}

module.exports = {
  DEFAULT_STANDARDS,
  calculateUnitWeights,
  calculateQualityRatings,
  classifyWAWQI,
  evaluateWAWQI,
  getStandards,
  setStandards
};
