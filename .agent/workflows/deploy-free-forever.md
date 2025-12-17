# Deploying LAMS to Vercel (Free Serverless Architecture)

Follow these exact steps to complete the "Free Forever" setup.

## Phase 1: Vercel (Hosting & Backend)

1.  **Push to GitHub**:
    *   Ensure your latest code is pushed to your GitHub repository.

2.  **Create Project in Vercel**:
    *   Go to [Vercel.com](https://vercel.com) and Log in.
    *   Click **"Add New"** -> **"Project"**.
    *   **Import** your `LAMS-2.0` repository.

3.  **Configure Build Settings** (Crucial):
    *   **Framework Preset**: Select `Vite`.
    *   **Root Directory**: Leave as `./` (Root).
    *   **Build Command**: `vite build`
    *   **Output Directory**: `dist`
    *   **Install Command**: `npm install`

4.  **Add Environment Variables** (The most important step):
    *   Go to **"Environment Variables"** section on the deployment screen.
    *   Add the following variables (Copy values from your local `.env` or Firebase Console):

    | Name | Value |
    | :--- | :--- |
    | `VITE_FIREBASE_API_KEY` | *(Your Firebase Config API Key)* |
    | `VITE_FIREBASE_AUTH_DOMAIN` | *(Your Firebase Auth Domain)* |
    | `VITE_FIREBASE_PROJECT_ID` | *(Your Firebase Project ID)* |
    | `VITE_FIREBASE_STORAGE_BUCKET` | *(Your Storage Bucket)* |
    | `VITE_FIREBASE_MESSAGING_SENDER_ID` | *(Your Sender ID)* |
    | `VITE_FIREBASE_APP_ID` | *(Your App ID)* |
    | `VITE_FIREBASE_VAPID_KEY` | *(Your Web Push Key pair Certificate)* |
    | `CRON_SECRET` | `lams_auto_notify_secure_key` (Or any password you choose) |
    | `FIREBASE_SERVICE_ACCOUNT` | *(See Phase 2 below)* |

5.  **Hit "Deploy"**
    *   Wait for the build to finish. Your app is now live! 🚀

---

## Phase 2: Getting the Service Account Key

To allow Vercel to look up notifications securley, it needs "Admin Access".

1.  Go to **Firebase Console** -> **Project Settings**.
2.  Go to the **"Service accounts"** tab.
3.  Click **"Generate new private key"**.
4.  It will download a `.json` file. **Open this file**.
5.  Copy the **entire content** (it starts with `{` and ends with `}`).
6.  Go back to **Vercel** -> **Settings** -> **Environment Variables**.
7.  Add/Edit `FIREBASE_SERVICE_ACCOUNT`.
8.  Paste the **entire JSON string** as the value.
9.  **Redeploy** (Go to Deployments -> Redeploy) for this variable to take effect.

---

## Phase 3: Setup the Automation (Cron Job)

Now we need a "Robot" to click your notification button every minute.

1.  Go to [**Cron-Job.org**](https://cron-job.org/en/) (It's Free).
2.  Sign Up / Login.
3.  Click **"Create Cronjob"**.
4.  **Title**: `LAMS Notification Check`
5.  **URL**: `https://YOUR-VERCEL-URL.vercel.app/api/check-classes`
    *   (Replace `YOUR-VERCEL-URL` with your actual domain).
6.  **Schedule**: Select **"Every 1 minute"**.
7.  **Advanced** Section:
    *   Look for **Headers**.
    *   Add a Header:
        *   **Key**: `Authorization`
        *   **Value**: `Bearer lams_auto_notify_secure_key` (Must match your `CRON_SECRET` in Vercel).
8.  Click **Create**.

---

### Verification
*   Create a class in LAMS that starts in **20 minutes**.
*   Wait 5 minutes.
*   Once the time is exactly **15 minutes** before the class, the faculty member should receive a notification on their device (if permitted).
*   You can check Cron-Job.org logs to see `Status: 200 OK`.
