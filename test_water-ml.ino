#include <Wire.h>
#include "SSD1306Wire.h"
#include <OneWire.h>
#include <DallasTemperature.h>

// =========================
// OLED (Heltec WiFi LoRa 32 V2)
// =========================
#define OLED_SDA 4
#define OLED_SCL 15
#define OLED_RST 16

SSD1306Wire display(0x3C, OLED_SDA, OLED_SCL);

// =========================
// TURBIDITY SENSOR
// =========================
// NOTE: GPIO34 is reserved for board-control functions on the
// Heltec WiFi LoRa 32 V2 (shared with onboard LoRa SPI/control lines)
// and gives unreliable ADC readings. Use GPIO36 instead.
#define TURBIDITY_PIN 36

// Voltage divider on sensor AOUT:
//   AOUT --[10k]--+--[15k]-- GND
//                 |
//              GPIO36
// Vgpio = Vsensor * 15k / (10k + 15k)
const float R1 = 10000.0; // AOUT side
const float R2 = 15000.0; // GND side
const float DIVIDER_RATIO = (R1 + R2) / R2; // = 25/15

// =========================
// DS18B20 TEMPERATURE SENSOR
// =========================
// Data wire on GPIO17, with a 4.7k pull-up resistor to 3.3V
#define TEMP_PIN 17

OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

// =========================
// TDS SENSOR (DFRobot Gravity Analog TDS Kit V1.0)
// =========================
// Signal output already conditioned to ~0-2.3V by the module's
// onboard op-amp, so it connects directly to the ADC (no divider).
#define TDS_PIN 39
#define VREF 3.3      // ESP32 ADC reference voltage
#define TDS_ADC_MAX 4095.0

void setup() {
  Serial.begin(115200);

  // OLED reset sequence
  pinMode(OLED_RST, OUTPUT);
  digitalWrite(OLED_RST, LOW);
  delay(20);
  digitalWrite(OLED_RST, HIGH);

  display.init();
  display.flipScreenVertically();

  // ADC setup
  analogReadResolution(12);              // 0-4095
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db); // ~0-3.3V range
  analogSetPinAttenuation(TDS_PIN, ADC_11db);       // ~0-3.3V range

  // DS18B20 setup
  tempSensor.begin();

  display.clear();
  display.setFont(ArialMT_Plain_16);
  display.drawString(0, 10, "Turbidity Sensor");
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 35, "Starting...");
  display.display();

  delay(1500);
}

void loop() {
  // Take multiple readings and average them to reduce noise
  long total = 0;
  const int SAMPLES = 20;

  for (int i = 0; i < SAMPLES; i++) {
    total += analogRead(TURBIDITY_PIN);
    delay(5);
  }

  int raw = total / SAMPLES;

  // Voltage at the ESP32 ADC pin
  float adcVoltage = (raw / 4095.0) * 3.3;

  // Reconstructed voltage at the sensor's AOUT (before the divider)
  float sensorVoltage = adcVoltage * DIVIDER_RATIO;

  // Read water temperature
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  bool tempOk = (tempC != DEVICE_DISCONNECTED_C);
  float tempForCompensation = tempOk ? tempC : 25.0; // fall back to 25C if probe is offline

  // Read TDS sensor (averaged, same pattern as turbidity)
  long tdsTotal = 0;
  for (int i = 0; i < SAMPLES; i++) {
    tdsTotal += analogRead(TDS_PIN);
    delay(5);
  }
  int tdsRaw = tdsTotal / SAMPLES;
  float tdsVoltage = (tdsRaw / TDS_ADC_MAX) * VREF;

  // DFRobot's standard temperature-compensated TDS formula
  float compensationCoefficient = 1.0 + 0.02 * (tempForCompensation - 25.0);
  float compensationVoltage = tdsVoltage / compensationCoefficient;
  float tdsValue = (133.42 * pow(compensationVoltage, 3)
                     - 255.86 * pow(compensationVoltage, 2)
                     + 857.39 * compensationVoltage) * 0.5; // ppm

  // =========================
  // SERIAL MONITOR
  // =========================
  Serial.print("Raw ADC: ");
  Serial.print(raw);
  Serial.print(" | ADC: ");
  Serial.print(adcVoltage, 3);
  Serial.print(" V | Sensor: ");
  Serial.print(sensorVoltage, 3);
  Serial.print(" V | Temp: ");
  if (tempOk) {
    Serial.print(tempC, 2);
    Serial.print(" C");
  } else {
    Serial.print("sensor not found");
  }
  Serial.print(" | TDS: ");
  Serial.print(tdsValue, 1);
  Serial.println(" ppm");

  // =========================
  // OLED
  // =========================
  display.clear();

  display.setFont(ArialMT_Plain_16);
  display.drawString(0, 0, "Turbidity");

  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 20, "ADC: " + String(raw));
  display.drawString(0, 31, "Sensor V: " + String(sensorVoltage, 2) + "V");
  String tempStr = tempOk ? (String(tempC, 1) + " C") : String("N/A");
  display.drawString(0, 42, "Temp: " + tempStr);
  display.drawString(0, 53, "TDS: " + String(tdsValue, 0) + " ppm");

  display.display();

  delay(500);
}
