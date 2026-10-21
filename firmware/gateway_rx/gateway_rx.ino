


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
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// ==========================================
// 1. NETWORK & SERVER CONFIGURATION
// ==========================================
// WiFi credentials are NOT hardcoded. On first boot (or when the saved network can't be
// reached) the gateway hosts its own hotspot, "Agosense-Gateway-Setup". Connect to it with a
// phone/laptop, a setup page opens (or browse to http://192.168.4.1), pick your WiFi and
// enter its password. Credentials are saved in flash (Preferences) and reused on every boot.
// To change the network later: press and hold the PRG button for ~1.5 s during the
// "Hold PRG" prompt shown on the OLED right after power-up.
const char* AP_SSID       = "Agosense-Gateway-Setup";
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;   // per connection attempt
const unsigned long WIFI_LOST_RESTART_MS    = 300000;  // reboot into setup flow after 5 min offline
#define RESET_BUTTON 0 // Heltec V2 PRG button

Preferences prefs;
WebServer portalServer(80);
DNSServer dnsServer;
String wifiSsid = "";
String wifiPass = "";
unsigned long wifiLostSince = 0;

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

// ------------------------------------------------------------------
// WiFi provisioning (captive portal)
// ------------------------------------------------------------------
void showOledMessage(String l1, String l2 = "", String l3 = "", String l4 = "") {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, l1);
  display.drawString(0, 14, l2);
  display.drawString(0, 28, l3);
  display.drawString(0, 42, l4);
  display.display();
}

String htmlEscape(const String& s) {
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') out += "&amp;";
    else if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '"') out += "&quot;";
    else if (c == '\'') out += "&#39;";
    else out += c;
  }
  return out;
}

const char PORTAL_STYLE[] PROGMEM =
  "<style>body{font-family:system-ui,sans-serif;background:#f2f8fe;color:#0a2540;margin:0;padding:20px}"
  ".card{max-width:420px;margin:0 auto;background:#fff;border:1px solid #cfe3f5;border-radius:16px;padding:24px;"
  "box-shadow:0 12px 32px -12px rgba(3,105,161,.3)}h1{font-size:1.3rem;margin:0 0 4px;color:#0369a1}"
  "p{color:#6584a8;font-size:.9rem}label{display:block;margin:14px 0 4px;font-weight:600;font-size:.85rem}"
  "input,select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cfe3f5;border-radius:10px;font-size:1rem}"
  "button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:999px;color:#fff;font-size:1rem;font-weight:700;"
  "background:linear-gradient(135deg,#0ea5e9,#0369a1)}</style>";

void handlePortalRoot() {
  int n = WiFi.scanNetworks();
  String page = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>Agosense Gateway Setup</title>";
  page += FPSTR(PORTAL_STYLE);
  page += "</head><body><div class='card'><h1>Agosense Gateway</h1>"
          "<p>Choose the WiFi network this gateway should use to send data to the server.</p>"
          "<form method='POST' action='/save'><label>Network</label><select name='ssid_pick'>";
  if (n <= 0) {
    page += "<option value=''>No networks found - type it below</option>";
  } else {
    for (int i = 0; i < n; i++) {
      String name = WiFi.SSID(i);
      if (name.length() == 0) continue;
      page += "<option value='" + htmlEscape(name) + "'>" + htmlEscape(name) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
  }
  page += "</select><label>Or type network name (hidden networks)</label>"
          "<input name='ssid_manual' placeholder='Optional'>"
          "<label>Password</label><input name='pass' type='password' placeholder='WiFi password'>"
          "<button type='submit'>Save &amp; Connect</button></form></div></body></html>";
  portalServer.send(200, "text/html", page);
  WiFi.scanDelete();
}

void handlePortalSave() {
  String ssid = portalServer.arg("ssid_manual");
  ssid.trim();
  if (ssid.length() == 0) ssid = portalServer.arg("ssid_pick");
  String pass = portalServer.arg("pass");

  if (ssid.length() == 0) {
    portalServer.send(400, "text/plain", "Please choose or type a network name.");
    return;
  }

  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);

  String page = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  page += FPSTR(PORTAL_STYLE);
  page += "</head><body><div class='card'><h1>Saved</h1><p>The gateway is restarting and will connect to <b>"
          + htmlEscape(ssid) + "</b>. You can close this page. If the connection fails, the setup hotspot will appear again.</p></div></body></html>";
  portalServer.send(200, "text/html", page);
  delay(1500);
  ESP.restart();
}

// Blocks until the user submits credentials (device restarts afterwards).
void startConfigPortal() {
  Serial.println("Starting WiFi setup hotspot: " + String(AP_SSID));
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID);
  delay(300);
  IPAddress apIP = WiFi.softAPIP();

  dnsServer.start(53, "*", apIP); // captive portal: any hostname -> this page
  portalServer.on("/", HTTP_GET, handlePortalRoot);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
    portalServer.send(302, "text/plain", "");
  });
  portalServer.begin();

  showOledMessage("WIFI SETUP MODE", "Join WiFi:", AP_SSID, "Open 192.168.4.1");

  while (true) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    delay(5);
  }
}

bool tryConnectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(wifiSsid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  showOledMessage("Connecting to WiFi...", wifiSsid);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("\nWiFi connection failed.");
  return false;
}

void connectWiFi() {
  prefs.begin("gateway", false);

  // Optional reset window: hold PRG ~1.5 s shortly after power-up to forget the saved network.
  // (Done after boot, not during reset, because holding PRG while resetting enters flash mode.)
  pinMode(RESET_BUTTON, INPUT_PULLUP);
  showOledMessage("AGOSENSE GATEWAY", "Hold PRG now to", "change WiFi...");
  unsigned long windowStart = millis();
  unsigned long pressedSince = 0;
  while (millis() - windowStart < 3000) {
    if (digitalRead(RESET_BUTTON) == LOW) {
      if (pressedSince == 0) pressedSince = millis();
      if (millis() - pressedSince >= 1500) {
        prefs.remove("ssid");
        prefs.remove("pass");
        Serial.println("Saved WiFi cleared.");
        break;
      }
    } else {
      pressedSince = 0;
    }
    delay(20);
  }

  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");

  if (wifiSsid.length() > 0 && tryConnectWiFi()) return;

  // No saved network, or it can't be reached -> host the setup hotspot
  startConfigPortal();
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
  // Check WiFi connection; try to reconnect, and reboot into the setup flow if offline too long
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiLostSince == 0) wifiLostSince = millis();
    WiFi.reconnect();
    if (millis() - wifiLostSince > WIFI_LOST_RESTART_MS) {
      Serial.println("WiFi offline too long - restarting.");
      ESP.restart();
    }
  } else {
    wifiLostSince = 0;
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

    // Node no longer sends a hardcoded site; location comes from the map pin on the server
    lastSite = "Node " + String(nodeNum);
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
