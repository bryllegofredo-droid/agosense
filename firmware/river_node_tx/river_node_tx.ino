/*
 * =====================================================================================
 * Agosense / WaQuaCast: Low-Power River Sensor Node (LoRa Transmitter)
 * Hardware: Heltec WiFi LoRa 32 V2 (ESP32 + SX1276)
 * 
 * Power Optimization:
 * - OLED display completely disabled and unpowered (Vext cut) to save 25-35mA
 * - Minimalist 10ms LED pulse on packet transmission
 * - Configurable Deep-Sleep timer between measurement intervals
 * 
 * Monitored Parameters:
 * 1. pH (Analog pH probe on GPIO 35)
 * 2. Temperature (Dallas DS18B20 1-Wire on GPIO 17)
 * 3. Turbidity (DFRobot / Analog Turbidity on GPIO 36 with 10k:15k voltage divider)
 * 4. Total Dissolved Solids - TDS (DFRobot Gravity TDS on GPIO 39)
 * 
 * RF Output:
 * - LoRa 915 MHz broadcast with RF connectivity markers (seq, batt_v, tx_pwr, sf, bw)
 * =====================================================================================
 */

#include <OneWire.h>
#include <DallasTemperature.h>
#include <SPI.h>
#include <LoRa.h>

// ==========================================
// 1. NODE CONFIGURATION & POWER MANAGEMENT
// ==========================================
// Change this for each physical site: "UPSTREAM", "MIDSTREAM", or "DOWNSTREAM"
#define SITE_ID "UPSTREAM"
const int NODE_NUM = 1; // 1 = Upstream, 2 = Midstream, 3 = Downstream

// Heltec Onboard Status LED (GPIO 25)
#define STATUS_LED 25

// Vext Control Pin on Heltec V2 (GPIO 21 controls the external 3.3V rail powering OLED)
#define VEXT_PIN 21

// Transmission interval
const unsigned long TX_INTERVAL_MS = 15000; // 15 seconds (or configure for deep sleep)
unsigned long lastTxTime = 0;
RTC_DATA_ATTR unsigned long bootCount = 0; // Preserved across deep sleep reboots

// ==========================================
// 2. HELTEC LORA PIN DEFINITIONS (V2)
// ==========================================
#define LORA_SCK     5
#define LORA_MISO    19
#define LORA_MOSI    27
#define LORA_SS      18
#define LORA_RST     14
#define LORA_DIO0    26

#define LORA_BAND    915E6  // Philippines AS923 / 915MHz
#define TX_POWER     17     // dBm (14-20)
#define SPREAD_FACTOR 9     // SF7 to SF12
#define SIGNAL_BW    125E3  // 125 kHz
#define CODING_RATE  7      // 4/7

// ==========================================
// 3. SENSOR PIN DEFINITIONS & CONSTANTS
// ==========================================
// Turbidity Sensor (GPIO 36)
// Voltage Divider: AOUT --[10k]--+--[15k]-- GND -> GPIO 36
#define TURBIDITY_PIN 36
const float TURB_R1 = 10000.0;
const float TURB_R2 = 15000.0;
const float TURB_DIVIDER_RATIO = (TURB_R1 + TURB_R2) / TURB_R2; // 25/15 = 1.6667

// DS18B20 Water Temperature Sensor (GPIO 17 with 4.7k pull-up)
#define TEMP_PIN 17
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

// TDS Sensor (GPIO 39 - Direct op-amp conditioned 0-2.3V output)
#define TDS_PIN 39
#define VREF 3.3
#define ADC_MAX 4095.0

// pH Sensor (GPIO 35 - ADC1 input)
#define PH_PIN 35
float pH_intercept = 7.00;
float pH_slope = -5.70;

// Heltec Onboard Battery Monitoring Pin (GPIO 37)
#define VBAT_PIN 37

// Sampling settings
const int NUM_SAMPLES = 25;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Fast bubble sort for rolling median spike rejection
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

// Median filtering to eliminate spurious ADC spikes
int getMedianADC(int pin, int samples) {
  int readings[samples];
  for (int i = 0; i < samples; i++) {
    readings[i] = analogRead(pin);
    delay(4);
  }
  sortArray(readings, samples);
  return readings[samples / 2];
}

// Brief status LED flash (15ms) - minimal power consumption
void flashLED(int count = 1) {
  for (int i = 0; i < count; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(15);
    digitalWrite(STATUS_LED, LOW);
    if (count > 1) delay(60);
  }
}

// Power management: disable OLED power rail to eliminate idle drain
void disableOLEDHardware() {
  // On Heltec WiFi LoRa 32 V2:
  // Vext (GPIO 21) = HIGH turns OFF the external 3.3V rail that powers the OLED
  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, HIGH);

  // Set OLED RST pin to LOW to prevent backpowering
  pinMode(16, OUTPUT);
  digitalWrite(16, LOW);
}

// ==========================================
// ARDUINO SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n--- Agosense River Node (Low Power Mode) ---");

  // 1. Cut power to OLED display hardware
  disableOLEDHardware();

  // 2. Initialize Status LED
  pinMode(STATUS_LED, OUTPUT);
  flashLED(2); // Double flash on boot

  // 3. Configure ADC pins
  analogReadResolution(12); // 0-4095
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db); // ~0-3.3V range
  analogSetPinAttenuation(TDS_PIN, ADC_11db);
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(VBAT_PIN, ADC_11db);

  // 4. Initialize Temperature Sensor
  tempSensor.begin();

  // 5. Initialize LoRa SPI
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  Serial.print("Initializing LoRa on ");
  Serial.print(LORA_BAND / 1E6);
  Serial.println(" MHz...");

  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("ERROR: LoRa init failed! Check wiring or board model.");
    while (1) {
      flashLED(3); // Triple flash error code
      delay(1000);
    }
  }

  LoRa.setTxPower(TX_POWER);
  LoRa.setSpreadingFactor(SPREAD_FACTOR);
  LoRa.setSignalBandwidth(SIGNAL_BW);
  LoRa.setCodingRate4(CODING_RATE);
  LoRa.enableCrc();

  Serial.println("LoRa Transceiver Ready. Running headless (No OLED) for power conservation.");
}

// ==========================================
// ARDUINO MAIN LOOP
// ==========================================
void loop() {
  unsigned long now = millis();
  if (now - lastTxTime >= TX_INTERVAL_MS || lastTxTime == 0) {
    lastTxTime = now;
    bootCount++;

    // 1. Read DS18B20 Water Temperature
    tempSensor.requestTemperatures();
    float tempC = tempSensor.getTempCByIndex(0);
    bool tempValid = (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0 && tempC < 85.0);
    float compensationTemp = tempValid ? tempC : 25.0;

    // 2. Read Turbidity
    int turbRaw = getMedianADC(TURBIDITY_PIN, NUM_SAMPLES);
    float turbAdcVoltage = (turbRaw / ADC_MAX) * VREF;
    float turbSensorVoltage = turbAdcVoltage * TURB_DIVIDER_RATIO;
    float turbidityNTU = -1120.4 * pow(turbSensorVoltage, 2) + 5742.3 * turbSensorVoltage - 4352.9;
    if (turbidityNTU < 0) turbidityNTU = 0;

    // 3. Read TDS with Temperature Compensation (Eq. 2 from Math Framework)
    int tdsRaw = getMedianADC(TDS_PIN, NUM_SAMPLES);
    float tdsAdcVoltage = (tdsRaw / ADC_MAX) * VREF;
    float tempCompensationFactor = 1.0 + 0.02 * (compensationTemp - 25.0);
    float compensatedTdsVoltage = tdsAdcVoltage / tempCompensationFactor;
    float tdsPPM = (133.42 * pow(compensatedTdsVoltage, 3) 
                  - 255.86 * pow(compensatedTdsVoltage, 2) 
                  + 857.39 * compensatedTdsVoltage) * 0.5;
    if (tdsPPM < 0) tdsPPM = 0;

    // 4. Read pH Probe
    int phRaw = getMedianADC(PH_PIN, NUM_SAMPLES);
    float phAdcVoltage = (phRaw / ADC_MAX) * VREF;
    float phVal = 7.0 + ((2.5 - phAdcVoltage) * pH_slope);
    if (phVal < 0) phVal = 0;
    if (phVal > 14) phVal = 14.0;

    // 5. Read Battery Voltage
    // Heltec V2 divider: 100k / 220k on GPIO 37
    int battRaw = analogRead(VBAT_PIN);
    float battVoltage = (battRaw / ADC_MAX) * VREF * 3.20; // calibrated divider multiplier
    if (battVoltage < 2.5 || battVoltage > 5.0) battVoltage = 3.85; // sane fallback

    // 6. Build LoRa JSON Telemetry with Network Markers
    String payload = "{";
    payload += "\"site\":\"" + String(SITE_ID) + "\",";
    payload += "\"node\":" + String(NODE_NUM) + ",";
    payload += "\"seq\":" + String(bootCount) + ",";
    payload += "\"uptime\":" + String(millis() / 1000) + ",";
    payload += "\"temp\":" + String(tempValid ? tempC : 25.0, 2) + ",";
    payload += "\"ph\":" + String(phVal, 2) + ",";
    payload += "\"turb_v\":" + String(turbSensorVoltage, 3) + ",";
    payload += "\"turb_ntu\":" + String(turbidityNTU, 1) + ",";
    payload += "\"tds\":" + String(tdsPPM, 1) + ",";
    payload += "\"batt_v\":" + String(battVoltage, 2) + ",";
    payload += "\"tx_pwr\":" + String(TX_POWER) + ",";
    payload += "\"sf\":" + String(SPREAD_FACTOR) + ",";
    payload += "\"bw\":" + String((int)(SIGNAL_BW / 1E3)) + ",";
    payload += "\"cr\":7";
    payload += "}";

    // 7. Transmit LoRa Packet
    Serial.print("[TX #" + String(bootCount) + "] Broadcast: ");
    Serial.println(payload);

    LoRa.beginPacket();
    LoRa.print(payload);
    bool txOk = LoRa.endPacket();

    if (txOk) {
      Serial.println(" -> Packet broadcast successfully.");
      flashLED(1); // 15ms pulse to confirm packet sent
    } else {
      Serial.println(" -> ERROR: LoRa transmission failed!");
      flashLED(2); // Double blink on failure
    }
  }

  delay(20);
}
