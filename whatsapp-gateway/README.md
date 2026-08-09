# OpenWA WhatsApp Gateway

This folder contains the configuration to deploy the **OpenWA** gateway for LAMS-2.0.
By default, this is configured to use the `baileys` engine which is extremely lightweight and can run on **Free Tier** cloud hosting without crashing from memory exhaustion.

## 1. Hosting Locally for Free (Recommended)

If you have a computer at the school that is always on:
1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Open a terminal in this folder and run:
   ```bash
   docker-compose up -d
   ```
3. Open `http://localhost:2785` in your browser.
4. Scan the QR code with your WhatsApp app (Settings -> Linked Devices).
5. To expose this to LAMS-2.0 securely over the internet for free, use a Cloudflare Tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:2785
   ```
   Paste the generated URL into LAMS-2.0's settings.

## 2. Hosting on a Free Cloud Provider (Render.com / Koyeb)

If you don't have a local machine, you can deploy this to a free cloud host.

**Koyeb (Best Free Tier):**
1. Create a free account on [Koyeb](https://www.koyeb.com/).
2. Create a new App -> Choose **Docker**.
3. Docker Image: `rmyndharis/openwa:latest`
4. Add Environment Variables:
   - `API_KEY`: `lams_secure_api_key_2026` (change this in production)
   - `ENGINE_TYPE`: `baileys`
   - `PORT`: `2785`
5. Expose Port: `2785`
6. Deploy. Once deployed, open the URL, scan the QR code, and update LAMS-2.0 settings.

**Render.com:**
*Note: Render sleeps after 15 minutes. You will need to use a service like `cron-job.org` to ping the API every 10 minutes to keep it awake.*
1. Create a **Web Service**.
2. Deploy from an existing image: `rmyndharis/openwa:latest`
3. Add the same Environment Variables as above.

## Connecting LAMS-2.0

Once your gateway is running, go to LAMS-2.0. The system uses the following environment variables (which you can set in your `.env` file):

```env
VITE_WHATSAPP_API_KEY=lams_secure_api_key_2026
VITE_WHATSAPP_API_URL=https://your-openwa-url.com
```

LAMS will handle sending POST requests to the `/api/sendText` endpoint automatically.
