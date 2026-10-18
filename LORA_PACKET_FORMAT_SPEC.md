# Agosense: LoRa Packet Formatting & RF Performance Specification

This document defines the packet schema and network diagnostics markers designed to evaluate the **connectivity and propagation performance of the LoRa protocol** across the Balutakay River monitoring transect.

---

## 1. Network Performance Evaluation Metrics

To rigorously assess the LoRa communication channel under dense riverbank foliage, elevation contours, and weather variations, the protocol captures metrics across both the **Transmitter (Node)** and the **Receiver (Gateway)**:

```
+------------------------------------------------------------------------------------+
|                                TRANSMITTER (Node Tx)                               |
+------------------------------------------------------------------------------------+
|  • Station Identifier (UPSTREAM / MIDSTREAM / DOWNSTREAM)                          |
|  • Monotonic Sequence Counter (seq: 1, 2, 3...)                                    |
|  • Transmit Power Level (tx_pwr: 14 to 20 dBm)                                     |
|  • RF Modulation Parameters (SF9, BW 125kHz, CR 4/7)                              |
|  • Battery Supply Voltage (batt_v: 3.2V - 4.2V Li-ion)                            |
|  • Sensor Telemetry (pH, Temp, Turbidity, TDS)                                     |
+------------------------------------------------------------------------------------+
                                         │
                                         ▼  [LoRa RF Broadcast Link (915 MHz)]
+------------------------------------------------------------------------------------+
|                                 RECEIVER (Gateway Rx)                              |
+------------------------------------------------------------------------------------+
|  • RSSI (Received Signal Strength Indicator in dBm)                                |
|  • SNR (Signal-to-Noise Ratio in dB)                                               |
|  • Frequency Error (Carrier offset in Hz from SX1276 AFC)                          |
|  • Packet Delivery Ratio (PDR % = Received Packets / Expected Packets * 100%)      |
|  • Packet Loss Count (Detected skipped sequence numbers)                           |
|  • Time-on-Air / Payload Byte Length                                               |
|  • Path Loss (PL = tx_pwr - RSSI in dB)                                            |
+------------------------------------------------------------------------------------+
```

---

## 2. Packet Schemas

### Format A: Human-Readable Enriched JSON (Recommended for Development & Debugging)

#### 1. Over-the-Air Payload (Node Tx $\rightarrow$ Gateway Rx):
```json
{
  "site": "UPSTREAM",
  "node": 1,
  "seq": 142,
  "temp": 26.85,
  "ph": 7.42,
  "turb_v": 3.120,
  "turb_ntu": 4.8,
  "tds": 145.0,
  "batt_v": 4.08,
  "tx_pwr": 17,
  "sf": 9,
  "bw": 125
}
```

#### 2. Gateway Enriched Payload (Gateway $\rightarrow$ Cloud Server):
Upon receiving the packet, the Heltec Gateway extracts hardware register diagnostics from the SX1276 chip and appends them to the JSON before transmitting over HTTP:

```json
{
  "site": "UPSTREAM",
  "node": 1,
  "seq": 142,
  "temp": 26.85,
  "ph": 7.42,
  "turb_v": 3.120,
  "turb_ntu": 4.8,
  "tds": 145.0,
  "batt_v": 4.08,
  "tx_pwr": 17,
  "sf": 9,
  "bw": 125,
  "rf_diagnostics": {
    "rssi": -76,
    "snr": 8.5,
    "freq_error_hz": 1240,
    "path_loss_db": 93,
    "packet_len": 164,
    "pdr_pct": 98.6,
    "lost_packets": 2,
    "gateway_id": "HELTEC-GW-01"
  }
}
```

---

### Format B: Compact Binary Struct (Optimized for Battery & Airtime)

For field deployments where minimizing airtime and battery consumption is critical, the telemetry can be packed into a 28-byte binary C `struct`:

```cpp
#pragma pack(push, 1)
struct LoRaPacket {
  uint8_t  node_id;       // 1 byte: 1=Upstream, 2=Midstream, 3=Downstream
  uint32_t seq;           // 4 bytes: Monotonic packet counter (0 - 4,294,967,295)
  uint16_t temp_x100;     // 2 bytes: Temp * 100 (e.g., 2735 = 27.35 °C)
  uint16_t ph_x100;       // 2 bytes: pH * 100 (e.g., 742 = 7.42 pH)
  uint16_t turb_ntu_x10;  // 2 bytes: Turbidity * 10 (e.g., 48 = 4.8 NTU)
  uint16_t turb_v_x1000;  // 2 bytes: Turbidity Voltage * 1000 (e.g., 3120 = 3.120 V)
  uint16_t tds_ppm;       // 2 bytes: TDS in ppm (0 - 65,535 ppm)
  uint16_t batt_mv;       // 2 bytes: Battery Voltage in mV (e.g., 3950 = 3.95 V)
  int8_t   tx_pwr;        // 1 byte: Transmit power in dBm (e.g., 17)
  uint8_t  sf;            // 1 byte: Spreading factor (e.g., 9)
  uint16_t checksum;      // 2 bytes: CRC-16 for payload integrity verification
};
#pragma pack(pop)
```

**Airtime Comparison (at SF9 / BW 125kHz / CR 4/7)**:
- **JSON Payload (~160 bytes)**: ~380 ms Time-on-Air.
- **Binary Struct (28 bytes)**: ~82 ms Time-on-Air (**78% reduction in channel congestion and battery drain**).

---

## 3. Connectivity Performance Assessment Formulae

When publishing results or writing research chapters on the communication layer, report these four standard empirical metrics:

### 1. Packet Delivery Ratio (PDR)
Measures link reliability over time:
$$\text{PDR} = \frac{N_{\text{received}}}{N_{\text{expected}}} \times 100\% = \frac{N_{\text{received}}}{\text{seq}_{\text{max}} - \text{seq}_{\text{initial}} + 1} \times 100\%$$

### 2. Path Loss ($PL$)
Quantifies signal attenuation over river terrain:
$$PL\,(\text{dB}) = P_{\text{tx}}\,(\text{dBm}) - \text{RSSI}\,(\text{dBm})$$

### 3. Signal Margin Above Demodulation Threshold ($M_{\text{snr}}$)
At $SF=9$, the Semtech SX1276 requires a minimum SNR limit of $-12.5\text{ dB}$:
$$M_{\text{snr}} = \text{SNR}_{\text{measured}} - \text{SNR}_{\text{limit}} = \text{SNR}_{\text{measured}} - (-12.5\text{ dB})$$
*If $M_{\text{snr}} > 6\text{ dB}$, the link is robust against environmental fading.*

### 4. Carrier Frequency Drift
$$\Delta f = |\text{packetFrequencyError()}|$$
Measures crystal oscillator drift caused by daytime heating and humidity changes along the river basin.
