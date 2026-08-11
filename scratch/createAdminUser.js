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
    const email = "padmalochan.mmaharana@gmail.com";
    const password = "AdminPassword123!";
    
    try {
        console.log(`Checking if user ${email} exists...`);
        try {
            const user = await auth.getUserByEmail(email);
            console.log(`User exists with UID: ${user.uid}. Updating password...`);
            await auth.updateUser(user.uid, { password });
            console.log("Password updated successfully!");
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                console.log(`User not found. Creating new Firebase Auth user for ${email}...`);
                const newUser = await auth.createUser({
                    email: email,
                    password: password,
                    emailVerified: true
                });
                console.log(`Created new Auth user with UID: ${newUser.uid}`);
            } else {
                throw e;
            }
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
    process.exit();
}

run();
