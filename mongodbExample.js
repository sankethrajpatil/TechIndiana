// mongodbExample.js
// Minimal MongoDB Atlas example for Node.js
// App type: AI chat history (techindiana_ai collection)
//
// Install dependencies:
//   npm install mongodb dotenv
//
// Run the example:
//   node mongodbExample.js

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

// 1. Get MongoDB URI from environment or fallback config
const MONGODB_URI = process.env.MONGODB_URI || (() => {
  try {
    return fs.readFileSync('mongodb_uri.txt', 'utf8').trim();
  } catch {
    console.error('No MONGODB_URI in .env or mongodb_uri.txt');
    process.exit(1);
  }
})();

// 2. Set database and collection names
const DB_NAME = 'techindiana';
const COLLECTION_NAME = 'techindiana_ai';

// 3. Create 10 realistic AI chat history documents
const now = Date.now();
const docs = Array.from({ length: 10 }, (_, i) => ({
  userId: `user${i+1}`,
  message: `This is message #${i+1} from user${i+1}`,
  sender: i % 2 === 0 ? 'user' : 'ai',
  // Use a real timestamp, spaced 1 hour apart
  timestamp: new Date(now - i * 3600 * 1000),
  sessionId: `session${Math.floor(i/2)+1}`
}));

async function main() {
  let client;
  try {
    // 4. Connect to MongoDB Atlas
    console.log('Connecting to MongoDB Atlas...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected!');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // 5. Insert 10 documents
    console.log('Inserting 10 chat history documents...');
    const insertResult = await collection.insertMany(docs);
    console.log(`Inserted ${insertResult.insertedCount} documents.`);

    // 6. Read and print 5 most recent documents by timestamp
    console.log('\n5 most recent chat messages:');
    const recent = await collection.find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    recent.forEach(doc => console.log(doc));

    // 7. Read and print one document by _id
    const oneId = insertResult.insertedIds[0];
    console.log(`\nFetching one document by _id: ${oneId}`);
    const oneDoc = await collection.findOne({ _id: oneId });
    console.log(oneDoc);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    // 8. Close the connection
    if (client) {
      await client.close();
      console.log('Connection closed.');
    }
  }
}

main();
