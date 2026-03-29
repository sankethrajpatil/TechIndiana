const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON)
        : undefined
    ),
  });
}

module.exports = admin;
