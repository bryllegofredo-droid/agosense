/*
 * =====================================================================================
 * Agosense: Standalone Sensor Bench Test & OLED Diagnostic Tool
 * Target Hardware: Heltec WiFi LoRa 32 V2 (ESP32 + 0.96" SSD1306 OLED)
 * 
 * Purpose:
 * - Bench-testing and calibrating all 4 water quality sensors without LoRa RF transmission.
 * - Live real-time readout on the onboard 0.96" OLED display and Serial Monitor (115200 baud).
 * 
 * Hardware Pin Mapping (Identical to Main Prototype):
 * 1. pH Sensor:
 *    - Signal: GPIO 35 (ADC1 Channel 7)
 *    - Power: 5.0V & GND
 * 
 * 2. DS18B20 Water Temperature:
 *    - Data wire: GPIO 17 (with 4.7k pull-up to 3.3V)
 *    - Power: 3.3V & GND
 * 
 * 3. Turbidity Sensor:
 *    - Signal: GPIO 36 (ADC1 Channel 0) through 10k:15k voltage divider
 *    - Power: 5.0V & GND
 *    - Divider: Sensor AOUT -> [10k] -> GPIO 36 -> [15k] -> GND
 * 
 * 4. TDS Sensor (DFRobot Gravity Analog):
 *    - Signal: GPIO 39 (ADC1 Channel 3 - Direct connection, 0-2.3V output)
 *    - Power: 3.3V & GND
 * 
 * 5. Onboard OLED Display (I2C):
 *    - SDA: GPIO 4, SCL: GPIO 15, RST: GPIO 16
 *    - Vext Control: GPIO 21 (LOW enables 3.3V power rail to OLED)
 * =====================================================================================
 */

#include <Wire.h>
#include "SSD1306Wire.h"
#include <OneWire.h>
#include <DallasTemperature.h>

// ==========================================
// 1. PIN DEFINITIONS
// ==========================================

// OLED (SSD1306 128x64 I2C)
#define OLED_SDA   4
#define OLED_SCL   15
#define OLED_RST   16
#define VEXT_PIN   21   // LOW = Power ON to OLED display on Heltec V2

SSD1306Wire display(0x3C, OLED_SDA, OLED_SCL);

// Sensor Pins
#define PH_PIN        32   // Analog pH probe (ADC1 Channel 4 - Clean high impedance, no pull-downs)
#define TEMP_PIN      17   // DS18B20 1-Wire Data
#define TURBIDITY_PIN 36   // Analog Turbidity (through divider)
#define TDS_PIN       39   // Analog TDS probe

// ADC & Voltage Reference Constants
#define VREF         3.3
#define ADC_MAX      4095.0

// Turbidity Voltage Divider (R1 = 10k, R2 = 15k)
const float TURB_R1 = 10000.0;  
const float TURB_R2 = 15000.0;
const float TURB_DIVIDER_RATIO = (TURB_R1 + TURB_R2) / TURB_R2; // 25/15 = 1.6667

// pH Calibration Defaults (Adjust during buffer 4.01 / 7.00 calibration)
float pH_intercept = 7.00;
float pH_slope = -5.70; // Change in pH per volt

// DS18B20 1-Wire Bus Setup
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

// Sampling
const int SAMPLES = 25;
unsigned long sampleCount = 0;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Median sort to filter electrical ADC noise
void sortArray(int a[], int size) {
  for (int i = 0; i < size - 1; i++) {
    for (int j = 0; j < size - i - 1; j++) {
      if (a[j] > a[j + 1]) {
        int temp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = temp;
      }
    }
  }
}

int getMedianADC(int pin, int samples) {
  int readings[samples];
  for (int i = 0; i < samples; i++) {
    readings[i] = analogRead(pin);
    delay(3);
  }
  sortArray(readings, samples);
  return readings[samples / 2];
}

// Power up and reset OLED
void initOLED() {
  // On Heltec WiFi LoRa 32 V2, Vext (GPIO 21) controls the 3.3V power rail to the OLED
  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, LOW); // LOW powers ON the external rail
  delay(50);

  // Hardware reset pulse to OLED
  pinMode(OLED_RST, OUTPUT);
  digitalWrite(OLED_RST, LOW);
  delay(20);
  digitalWrite(OLED_RST, HIGH);
  delay(50);

  display.init();
  display.flipScreenVertically();
  display.clear();
  display.setFont(ArialMT_Plain_16);
  display.setTextAlignment(TEXT_ALIGN_CENTER);
  display.drawString(64, 8, "AGOSENSE");
  display.setFont(ArialMT_Plain_10);
  display.drawString(64, 32, "Sensor Bench Test");
  display.drawString(64, 46, "Calibrating probes...");
  display.display();
}

// Update OLED with all 4 live sensor readings
void updateOLED(float ph, float phV, float tempC, bool tempOk, float turbNTU, float turbSensorV, float tdsPPM, float tdsV) {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);

  // Top Title Bar
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "AGOSENSE SENSORS");
  display.drawString(98, 0, "#" + String(sampleCount));
  display.drawLine(0, 12, 128, 12);

  // Line 1: pH
  String phStr = "pH   : " + String(ph, 2) + " (" + String(phV, 2) + "V)";
  display.drawString(0, 15, phStr);

  // Line 2: Water Temperature
  String tempStr = tempOk ? (String(tempC, 1) + " C") : "Probe Offline";
  display.drawString(0, 27, "Temp : " + tempStr);

  // Line 3: Turbidity
  String turbStr = "Turb : " + String(turbNTU, 0) + " NTU (" + String(turbSensorV, 2) + "V)";
  display.drawString(0, 39, turbStr);

  // Line 4: TDS
  String tdsStr = "TDS  : " + String(tdsPPM, 0) + " ppm (" + String(tdsV, 2) + "V)";
  display.drawString(0, 51, tdsStr);

  display.display();
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==============================================");
  Serial.println("  AGOSENSE: SENSOR BENCH TEST (NO RF TX)      ");
  Serial.println("==============================================");

  // Initialize OLED Display
  initOLED();

  // Configure ESP32 12-bit ADC (0 - 4095) with 11dB attenuation (~0 to 3.3V)
  analogReadResolution(12);
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);
  analogSetPinAttenuation(TDS_PIN, ADC_11db);

  // Initialize DS18B20 Temperature Sensor
  tempSensor.begin();

  Serial.println("ADC & Temperature Probe Initialized.");
  Serial.println("Displaying readings every 800ms...\n");
  delay(1200);
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  sampleCount++;

  // -------------------------------------------------------------
  // 1. READ WATER TEMPERATURE (DS18B20)
  // -------------------------------------------------------------
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  bool tempOk = (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0 && tempC < 85.0);
  float compensationTemp = tempOk ? tempC : 25.0; // fallback reference to 25C

  // -------------------------------------------------------------
  // 2. READ TURBIDITY SENSOR
  // -------------------------------------------------------------
  int turbRaw = getMedianADC(TURBIDITY_PIN, SAMPLES);
  float turbAdcVoltage = (turbRaw / ADC_MAX) * VREF;
  // Reconstruct true sensor AOUT voltage before the 10k:15k divider
  float turbSensorVoltage = turbAdcVoltage * TURB_DIVIDER_RATIO;
  
  // Calibrated baseline: Distilled water = 3.45V (0 NTU reference)
  // Normalizes individual sensor baseline to standard 4.15V curve
  const float TURB_CLEAR_VOLTAGE = 3.45;
  float turbNormVoltage = turbSensorVoltage * (4.15 / TURB_CLEAR_VOLTAGE);
  if (turbNormVoltage > 4.15) turbNormVoltage = 4.15;

  // Calibrated polynomial curve: 0 NTU at clear water, increasing as voltage drops
  float turbidityNTU = 0.0;
  if (turbNormVoltage < 4.15) {
    turbidityNTU = -1120.4 * pow(turbNormVoltage, 2) + 5742.3 * turbNormVoltage - 4352.9;
  }
  if (turbidityNTU < 0.0 || turbSensorVoltage >= TURB_CLEAR_VOLTAGE) turbidityNTU = 0.0;

  // -------------------------------------------------------------
  // 3. READ TDS SENSOR (With Temperature Compensation)
  // -------------------------------------------------------------
  int tdsRaw = getMedianADC(TDS_PIN, SAMPLES);
  float tdsAdcVoltage = (tdsRaw / ADC_MAX) * VREF;
  
  // DFRobot temperature compensation coefficient (Math Framework Eq. 2)
  float tempCoefficient = 1.0 + 0.02 * (compensationTemp - 25.0);
  float compensatedTdsVoltage = tdsAdcVoltage / tempCoefficient;
  
  // Calibrated with 1382 ppm standard solution (fine-tuned K_factor = 1.620)
  const float TDS_CALIBRATION_FACTOR = 1.620;
  float tdsPPM = ((133.42 * pow(compensatedTdsVoltage, 3) 
                - 255.86 * pow(compensatedTdsVoltage, 2) 
                + 857.39 * compensatedTdsVoltage) * 0.5) * TDS_CALIBRATION_FACTOR;
  if (tdsPPM < 0) tdsPPM = 0;

  // -------------------------------------------------------------
  // 4. READ pH SENSOR
  // -------------------------------------------------------------
  int phRaw = getMedianADC(PH_PIN, SAMPLES);
  float phAdcVoltage = (phRaw / ADC_MAX) * VREF;
  
  // Calibrated with buffer 7.00 (1.415V) and buffer 4.01 (1.950V)
  const float PH_NEUTRAL_VOLTAGE = 1.415;
  const float PH_SLOPE = -5.589;
  float phValue = 7.00 + ((phAdcVoltage - PH_NEUTRAL_VOLTAGE) * PH_SLOPE);
  if (phValue < 0.0) phValue = 0.0;
  if (phValue > 14.0) phValue = 14.0;

  // -------------------------------------------------------------
  // 5. UPDATE OLED DISPLAY
  // -------------------------------------------------------------
  updateOLED(phValue, phAdcVoltage, tempC, tempOk, turbidityNTU, turbSensorVoltage, tdsPPM, tdsAdcVoltage);

  // -------------------------------------------------------------
  // 6. OUTPUT TO SERIAL MONITOR (115200 Baud)
  // -------------------------------------------------------------
  Serial.print("[#" + String(sampleCount) + "] ");
  Serial.print("pH: " + String(phValue, 2) + " (" + String(phAdcVoltage, 3) + "V) | ");
  
  if (tempOk) {
    Serial.print("Temp: " + String(tempC, 2) + " °C | ");
  } else {
    Serial.print("Temp: [OFFLINE] | ");
  }

  Serial.print("Turb: " + String(turbidityNTU, 1) + " NTU (ADC:" + String(turbAdcVoltage, 2) + "V, Sensor:" + String(turbSensorVoltage, 2) + "V) | ");
  Serial.println("TDS: " + String(tdsPPM, 1) + " ppm (" + String(tdsAdcVoltage, 3) + "V)");

  delay(800);
}
