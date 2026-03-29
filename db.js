import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client;
let db;

async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'techindiana_ai';
  if (!uri) {
    throw new Error('MONGODB_URI not set in environment');
  }

  client = new MongoClient(uri, {
    // use unified options recommended for Atlas
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    db = client.db(dbName);
    console.log(`Connected to MongoDB database: ${dbName}`);

    // Optional index creation if CREATE_INDEXES=true
    if (process.env.CREATE_INDEXES === 'true') {
      try {
        await db.collection('main_user_journeys').createIndex({ persona: 1 });
        await db.collection('main_user_journeys').createIndex({ program_recommended: 1 });
        await db.collection('question_bank').createIndex({ persona: 1 });
        await db.collection('decision_rules').createIndex({ persona: 1 });
        await db.collection('conversation_scenarios').createIndex({ persona: 1 });
        console.log('Optional indexes created');
      } catch (err) {
        console.error('Error creating indexes:', err);
      }
    }

    return { client, db };
  } catch (err) {
    console.error('Failed connecting to MongoDB:', err);
    throw err;
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call connectToDatabase first.');
  return db;
}

function getClient() {
  return client;
}

export { connectToDatabase, getDB, getClient };
