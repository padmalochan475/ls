import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'service-account.json'), 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();

async function run() {
    try {
        const email = 'padmalochan.maharana@tat.ac.in';
        console.log(`Looking up providers for ${email}...`);
        
        const userRec = await auth.getUserByEmail(email);
        console.log(`Auth UID: ${userRec.uid}`);
        console.log("Provider Data:");
        console.log(JSON.stringify(userRec.providerData, null, 2));
        
    } catch (e) {
        console.error("Error:", e.message);
    }
    process.exit();
}

run();
