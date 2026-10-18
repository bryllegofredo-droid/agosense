


/*
 * =====================================================================================
 * Agosense / WaQuaCast: Gateway Receiver Node (LoRa -> WiFi Bridge)
 * Hardware: Heltec WiFi LoRa 32 V2 (ESP32 + SX1276 + 0.96" SSD1306 OLED)
 * 
 * Function:
 * 1. Listens for incoming LoRa RF telemetry from River Sensor Nodes
 * 2. Extracts RSSI, SNR, and packet payload
 * 3. Connects to local WiFi / Hotspot
 * 4. Forwards telemetry via HTTP POST to the Agosense Backend Server (/api/telemetry)
 * 5. Displays reception metrics on onboard OLED
 * =====================================================================================
 */

#include <Wire.h>
#include "SSD1306Wire.h"
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ==========================================
// 1. NETWORK & SERVER CONFIGURATION
// ==========================================
// Update with your WiFi or phone hotspot credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Address of your Agosense cloud backend server (Vercel)
const char* SERVER_URL    = "https://agosense.vercel.app/api/telemetry";
const char* GATEWAY_KEY   = "agosense_secret_field_key_2026";


// ==========================================
// 2. HELTEC LORA PIN DEFINITIONS (V2)
// ==========================================
#define LORA_SCK     5
#define LORA_MISO    19
#define LORA_MOSI    27
#define LORA_SS      18
#define LORA_RST     14
#define LORA_DIO0    26

#define LORA_BAND    915E6 // Must match transmitter frequency (433E6, 868E6, or 915E6)
#define SPREAD_FACTOR 9
#define SIGNAL_BW    125E3
#define CODING_RATE  7

// ==========================================
// 3. ONBOARD OLED DISPLAY (0.96" SSD1306)
// ==========================================
#define OLED_SDA 4
#define OLED_SCL 15
#define OLED_RST 16

SSD1306Wire display(0x3C, OLED_SDA, OLED_SCL);

// Gateway statistics
// Gateway RF Performance Statistics per Node (1=Upstream, 2=Midstream, 3=Downstream)
struct NodeStats {
  unsigned long lastSeq;
  unsigned long totalReceived;
  unsigned long totalLost;
  float pdr;
};
NodeStats stationStats[4] = { {0, 0, 0, 100.0}, {0, 0, 0, 100.0}, {0, 0, 0, 100.0}, {0, 0, 0, 100.0} };

unsigned long rxCount = 0;
unsigned long forwardSuccessCount = 0;
String lastSite = "None";
int lastRssi = 0;
float lastSnr = 0;
long lastFreqError = 0;
float lastPdr = 100.0;
int lastHttpCode = 0;

void updateGatewayOLED(String status) {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);

  // Line 1: Header
  display.drawString(0, 0, "AGOSENSE GATEWAY");
  display.drawString(85, 0, WiFi.status() == WL_CONNECTED ? "[WiFi OK]" : "[NO WiFi]");

  // Line 2: IP
  display.drawString(0, 14, "IP: " + WiFi.localIP().toString());

  // Line 3: Last Rx Node & Sequence
  display.drawString(0, 26, "Rx: " + lastSite + " | PDR: " + String(lastPdr, 1) + "%");

  // Line 4: RF Metrics (RSSI & SNR)
  display.drawString(0, 38, "RSSI:" + String(lastRssi) + "dBm SNR:" + String(lastSnr, 1) + "dB");

  // Line 5: Upload Status & Freq Error
  display.drawString(0, 50, "HTTP:" + String(lastHttpCode) + " dF:" + String(lastFreqError) + "Hz");

  display.display();
}

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  display.clear();
  display.setTextAlignment(TEXT_ALIGN_CENTER);
  display.setFont(ArialMT_Plain_10);
  display.drawString(64, 20, "Connecting to WiFi...");
  display.drawString(64, 35, String(WIFI_SSID));
  display.display();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed! Telemetry will be buffered or dropped until connected.");
  }
}

// Forward enriched packet to server via HTTP POST
bool postToServer(String jsonPayload, int rssi, float snr, long freqError, int rawBytes, float pdr, int lostCount) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Warning: WiFi not connected. Cannot forward to server.");
    lastHttpCode = -1;
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Allows secure HTTPS forwarding to cloud without uploading certificate bundles

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Gateway-Auth", GATEWAY_KEY);
  http.addHeader("X-Gateway-ID", "Heltec-GW-01");

  // Inject comprehensive RF connectivity diagnostics into JSON payload
  String enrichedPayload = jsonPayload;
  enrichedPayload.trim();
  if (enrichedPayload.endsWith("}")) {
    enrichedPayload = enrichedPayload.substring(0, enrichedPayload.length() - 1);
    enrichedPayload += ",\"rssi\":" + String(rssi);
    enrichedPayload += ",\"snr\":" + String(snr, 1);
    enrichedPayload += ",\"freq_error\":" + String(freqError);
    enrichedPayload += ",\"packet_len\":" + String(rawBytes);
    enrichedPayload += ",\"pdr\":" + String(pdr, 1);
    enrichedPayload += ",\"packet_loss\":" + String(lostCount);
    enrichedPayload += "}";
  }

  Serial.println("[HTTP POST] Sending to " + String(SERVER_URL));
  Serial.println("Payload: " + enrichedPayload);

  int httpResponseCode = http.POST(enrichedPayload);
  lastHttpCode = httpResponseCode;

  bool success = false;
  if (httpResponseCode > 0) {
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    String response = http.getString();
    Serial.println("Server Response: " + response);
    if (httpResponseCode >= 200 && httpResponseCode < 300) {
      success = true;
      forwardSuccessCount++;
    }
  } else {
    Serial.print("Error code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
  return success;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- Agosense LoRa Gateway Starting ---");

  // Reset OLED
  pinMode(OLED_RST, OUTPUT);
  digitalWrite(OLED_RST, LOW);
  delay(20);
  digitalWrite(OLED_RST, HIGH);

  display.init();
  display.flipScreenVertically();

  // Connect WiFi
  connectWiFi();

  // Initialize LoRa SPI
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("ERROR: LoRa init failed!");
    display.clear();
    display.setTextAlignment(TEXT_ALIGN_CENTER);
    display.setFont(ArialMT_Plain_10);
    display.drawString(64, 25, "LORA INIT FAILED!");
    display.display();
    while (1) { delay(1000); }
  }

  LoRa.setSpreadingFactor(SPREAD_FACTOR);
  LoRa.setSignalBandwidth(SIGNAL_BW);
  LoRa.setCodingRate4(CODING_RATE);
  LoRa.enableCrc();

  Serial.println("LoRa Receiver Listening on " + String(LORA_BAND / 1E6) + " MHz");
  updateGatewayOLED("Listening");
}

void loop() {
  // Check WiFi connection and auto-reconnect if dropped
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }

  // Check for incoming LoRa packet
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    rxCount++;
    String incomingPayload = "";
    while (LoRa.available()) {
      incomingPayload += (char)LoRa.read();
    }

    lastRssi = LoRa.packetRssi();
    lastSnr = LoRa.packetSnr();
    lastFreqError = LoRa.packetFrequencyError();

    Serial.println("\n=================================");
    Serial.println("[LoRa RX #" + String(rxCount) + "] Packet Received (" + String(packetSize) + " bytes)");
    Serial.println("Data: " + incomingPayload);
    Serial.println("RSSI: " + String(lastRssi) + " dBm | SNR: " + String(lastSnr, 1) + " dB | FreqErr: " + String(lastFreqError) + " Hz");
    Serial.println("=================================");

    // Extract site name and node id
    int nodeNum = 1;
    int nodeIdx = incomingPayload.indexOf("\"node\":");
    if (nodeIdx != -1) {
      nodeNum = incomingPayload.substring(nodeIdx + 7, nodeIdx + 8).toInt();
      if (nodeNum < 1 || nodeNum > 3) nodeNum = 1;
    }

    int siteIndex = incomingPayload.indexOf("\"site\":\"");
    if (siteIndex != -1) {
      int endIndex = incomingPayload.indexOf("\"", siteIndex + 8);
      if (endIndex != -1) {
        lastSite = incomingPayload.substring(siteIndex + 8, endIndex);
      }
    }

    // Extract sequence counter to compute Packet Delivery Ratio (PDR)
    unsigned long seqNum = rxCount;
    int seqIdx = incomingPayload.indexOf("\"seq\":");
    if (seqIdx != -1) {
      int commaIdx = incomingPayload.indexOf(",", seqIdx);
      if (commaIdx != -1) {
        seqNum = incomingPayload.substring(seqIdx + 6, commaIdx).toInt();
      }
    }

    // Update Node Packet Statistics
    if (stationStats[nodeNum].lastSeq > 0 && seqNum > stationStats[nodeNum].lastSeq + 1) {
      unsigned long missed = (seqNum - stationStats[nodeNum].lastSeq) - 1;
      stationStats[nodeNum].totalLost += missed;
      Serial.println("⚠️ Packet Drop Detected! Missed: " + String(missed) + " packets from Node " + String(nodeNum));
    }
    stationStats[nodeNum].lastSeq = seqNum;
    stationStats[nodeNum].totalReceived++;
    unsigned long totalExpected = stationStats[nodeNum].totalReceived + stationStats[nodeNum].totalLost;
    float currentPdr = totalExpected > 0 ? ((float)stationStats[nodeNum].totalReceived / totalExpected) * 100.0 : 100.0;
    stationStats[nodeNum].pdr = currentPdr;
    lastPdr = currentPdr;

    updateGatewayOLED("Uploading...");

    // Forward to server with full RF markers
    bool posted = postToServer(incomingPayload, lastRssi, lastSnr, lastFreqError, packetSize, currentPdr, stationStats[nodeNum].totalLost);
    updateGatewayOLED(posted ? "Sent OK" : "Send Fail");
  }

  delay(10);
}
