import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let firebaseAdmin: admin.app.App;

try {
    let serviceAccount: any;

    // 1. Try to load from environment variable (Secure for Production/Railway)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log('ℹ️ Loading Firebase credentials from environment variable');
        } catch (parseError) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON');
        }
    }

    // 2. Fallback to local file if no env var or parse failed
    if (!serviceAccount) {
        const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            serviceAccount = require(serviceAccountPath);
            console.log('ℹ️ Loading Firebase credentials from local serviceAccountKey.json');
        }
    }

    if (!serviceAccount) {
        throw new Error('No Firebase service account credentials found (checked FIREBASE_SERVICE_ACCOUNT env var and serviceAccountKey.json)');
    }

    // Initialize Firebase Admin SDK
    firebaseAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error: any) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
    // Don't throw if we're in build context, but in runtime we want to know
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }
}

export default firebaseAdmin!;
export { admin };
