# Agosense: Database & Cloud Web Hosting Implementation Guide

This guide outlines the step-by-step procedures for transitioning the Agosense platform from local development (`localhost:3000`) to a cloud-hosted infrastructure accessible from field deployments.

---

## 1. System Architecture & Telemetry Pipeline

```mermaid
flowchart LR
    subgraph Field [Field Deployment: Balutakay River]
        TX[River Sensor Node] -- LoRa Radio 915MHz --> GW[Heltec Gateway Node]
        GW -- 4G Hotspot / WiFi --> NET((Public Internet))
    end

    subgraph CloudHosting [Cloud Hosting Platform]
        NET -- Public HTTPS POST --> API[Express Ingestion API]
        API --> WQI[WAWQI Calculator]
        WQI --> DB[(Production Database)]
        API --> UI[Web Dashboard]
    end

    subgraph Clients [Clients & Researchers]
        UI -- HTTPS --> BROWSER[Research Team & Advisors]
    end
```

---

## 2. Database Implementation Steps

### 2.1 Recommended Database: Managed PostgreSQL (Supabase or Neon)
For environmental monitoring and research publishing, a relational database with time-series indexing (PostgreSQL) is recommended because it provides:
- Structured schema validation.
- Easy export to CSV, Excel, R, or Python pandas for statistical analysis (ANOVA, Lin's CCC, Bland–Altman).
- Automatic daily backups and a web-based table editor.

#### Step 1: Provision a Free Cloud PostgreSQL Instance
1. Sign up at [Supabase](https://supabase.com) or [Neon](https://neon.tech) (both provide generous free tiers).
2. Create a new project: `agosense-db`.
3. Copy the PostgreSQL connection URI from your project settings:
   ```env
   DATABASE_URL="postgres://username:password@ep-sample-123.region.neon.tech/agosense?sslmode=require"
   ```

#### Step 2: Execute Database Schema
Run the following SQL in your database SQL Editor:

```sql
-- 1. Stations Table
CREATE TABLE stations (
    station_id VARCHAR(20) PRIMARY KEY,
    station_name VARCHAR(50) NOT NULL,
    river_name VARCHAR(50) DEFAULT 'Balutakay River',
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    node_hardware_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO stations (station_id, station_name, node_hardware_id) VALUES
('UPSTREAM', 'Balutakay Upper Transect', 1),
('MIDSTREAM', 'Balutakay Agricultural Midstream', 2),
('DOWNSTREAM', 'Balutakay Settlement Downstream', 3)
ON CONFLICT (station_id) DO NOTHING;

-- 2. Telemetry & WAWQI Logs Table
CREATE TABLE telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    station_id VARCHAR(20) REFERENCES stations(station_id),
    packet_seq INT NOT NULL,
    
    -- Raw and Calibrated Sensor Metrics
    ph_value NUMERIC(4,2) NOT NULL,
    temp_celsius NUMERIC(4,2) NOT NULL,
    turbidity_voltage NUMERIC(5,3),
    turbidity_ntu NUMERIC(6,2) NOT NULL,
    tds_ppm NUMERIC(6,2) NOT NULL,
    
    -- WAWQI Evaluated Metrics (DENR DAO 2016-08)
    wawqi_score NUMERIC(5,2) NOT NULL,
    classification VARCHAR(30) NOT NULL,
    dominant_parameter VARCHAR(30) NOT NULL,
    dominant_contribution_pct NUMERIC(4,1) NOT NULL,
    
    -- Sub-Index Breakdown (Qi * Wi)
    subindex_ph NUMERIC(5,2),
    subindex_temp NUMERIC(5,2),
    subindex_turbidity NUMERIC(5,2),
    subindex_tds NUMERIC(5,2),
    
    -- Quality Ratings (Qi)
    quality_ph NUMERIC(5,2),
    quality_temp NUMERIC(5,2),
    quality_turbidity NUMERIC(5,2),
    quality_tds NUMERIC(5,2),
    
    -- RF Link Quality Metrics
    rssi_dbm INT,
    snr_db NUMERIC(4,1)
);

-- Indexes for rapid time-series filtering
CREATE INDEX idx_telemetry_station_time ON telemetry_logs (station_id, timestamp DESC);
CREATE INDEX idx_telemetry_timestamp ON telemetry_logs (timestamp DESC);
```

#### Step 3: Install PostgreSQL Client in Server
In `d:\Agosense\server`, install the `pg` client:
```bash
npm install pg dotenv
```

---

## 3. Web Hosting & Deployment Options

### Option A: Render.com (Recommended — Zero Cost & Quickest)
Render provides free web service hosting with automatic HTTPS SSL certificates and GitHub Continuous Deployment.

#### Steps:
1. **Push your code to GitHub**:
   Initialize a Git repository in `d:\Agosense` and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Agosense IoT Platform"
   git branch -M main
   git remote add origin https://github.com/<your-username>/agosense.git
   git push -u origin main
   ```
2. **Create a Web Service on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com) and click **New + > Web Service**.
   - Connect your GitHub repository.
   - Configure the service settings:
     - **Name**: `agosense-telemetry`
     - **Root Directory**: `server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node index.js`
     - **Plan**: `Free`
3. **Configure Environment Variables**:
   Under the **Environment** tab on Render, add:
   ```env
   NODE_ENV=production
   PORT=10000
   GATEWAY_API_KEY=your_secure_random_key_here
   DATABASE_URL=postgres://... (from Supabase/Neon)
   ```
4. **Deploy**:
   Click **Create Web Service**. Within 2 minutes, Render will assign you a live HTTPS URL:
   `https://agosense-telemetry.onrender.com`

---

### Option B: Cloudflare Tunnel (Recommended for Raspberry Pi / Local Host)
If you prefer running the server locally on a Raspberry Pi or lab computer without needing a public IP or port forwarding:

1. Install Cloudflare `cloudflared`:
   - On Windows: `winget install --id Cloudflare.cloudflared`
   - On Linux/Raspberry Pi: `sudo apt install cloudflared`
2. Run a zero-configuration ephemeral tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Cloudflare will output an instantaneous, free HTTPS URL:
   ```
   https://random-assigned-name.trycloudflare.com
   ```
   *Any packet sent to this URL is securely tunneled directly to your local Node server.*

---

### Option C: Ubuntu Linux VPS (DigitalOcean / Linode / AWS EC2)
For an institution-owned, permanent server:

1. **Provision VPS**: Ubuntu 22.04 or 24.04 LTS ($4–$6/month).
2. **Install Node.js & Process Manager (PM2)**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
   sudo npm install -g pm2
   ```
3. **Deploy the App**:
   ```bash
   git clone https://github.com/<your-username>/agosense.git /var/www/agosense
   cd /var/www/agosense/server
   npm install --production
   pm2 start index.js --name "agosense"
   pm2 startup
   pm2 save
   ```
4. **Configure Nginx Reverse Proxy** (`/etc/nginx/sites-available/agosense`):
   ```nginx
   server {
       server_name agosense.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
5. **Enable SSL with Let's Encrypt**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/agosense /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d agosense.yourdomain.com
   ```

---

## 4. Updating the LoRa Gateway Firmware for Public HTTPS

Once your server is deployed to `https://agosense-telemetry.onrender.com` (or your domain):

1. Open [firmware/gateway_rx/gateway_rx.ino](file:///d:/Agosense/firmware/gateway_rx/gateway_rx.ino).
2. Update the `SERVER_URL` and add your security key:
   ```cpp
   // ==========================================
   // 1. NETWORK & SERVER CONFIGURATION
   // ==========================================
   const char* WIFI_SSID     = "RESEARCH_HOTSPOT";
   const char* WIFI_PASSWORD = "HotspotPassword123";

   // Cloud production URL:
   const char* SERVER_URL    = "https://agosense-telemetry.onrender.com/api/telemetry";
   const char* GATEWAY_KEY   = "your_secure_random_key_here";
   ```
3. In the `postToServer` function, verify that the security header is included:
   ```cpp
   HTTPClient http;
   http.begin(SERVER_URL);
   http.addHeader("Content-Type", "application/json");
   http.addHeader("X-Gateway-Auth", GATEWAY_KEY);
   http.addHeader("X-Gateway-ID", "Heltec-GW-01");
   ```

> [!NOTE]
> On the ESP32 `HTTPClient`, when connecting to HTTPS endpoints with valid CA certificates (such as Render or Cloudflare), using `WiFiClientSecure` with `.setInsecure()` or standard `HTTPClient` allows connecting without embedding certificate bundles.

---

## 5. Security & Maintenance Checklist

- [ ] **API Ingestion Authentication**: Validate the `X-Gateway-Auth` header in `server/index.js` so only your gateway can insert readings into the database.
- [ ] **Rate Limiting**: Add `express-rate-limit` on the ingestion route to prevent spam or DDoS attacks.
- [ ] **Automated Backups**: Configure scheduled daily PostgreSQL backups (native in Supabase/Neon) or cron export to CSV.
- [ ] **Data Integrity**: Verify that raw sensor voltages ($V_{\text{raw}}$) are preserved alongside computed WAWQI scores for reproducibility in research publications.

## Sample Pins Table (map pins)

Run in Supabase -> SQL Editor so pins persist on Vercel:

```sql
create table if not exists sample_pins (
  id bigint generated always as identity primary key,
  lat double precision not null,
  lng double precision not null,
  label text not null,
  site text,
  note text,
  created_at timestamptz default now()
);
```
