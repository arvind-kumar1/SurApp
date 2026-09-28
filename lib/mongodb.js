import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,
};

let client;
let clientPromise;

export function getMongoClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Please add your MONGODB_URI environment variable to .env.local or Vercel Environment Variables.');
  }

  const currentUri = process.env.MONGODB_URI;

  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
      client = new MongoClient(currentUri, options);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  } else {
    // In production mode (e.g. Vercel serverless), it's best to not use a global variable.
    if (!clientPromise) {
      client = new MongoClient(currentUri, options);
      clientPromise = client.connect();
    }
    return clientPromise;
  }
}

export async function getDb(dbName) {
  const connectedClient = await getMongoClientPromise();
  return connectedClient.db(dbName || process.env.MONGODB_DB || 'sur_app');
}
