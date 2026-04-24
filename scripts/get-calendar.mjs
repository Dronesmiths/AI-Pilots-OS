import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '/Users/briansmith/Developer Folder--Holds AIpilots CRM/AI-Workspace/AI Pilots CRM 2/AI-Pilots-CRM-/.env.local' });

async function getCalendar() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId("69d1279de59c3b3a20a7829b") });
  
  if (!user) {
    console.log("User not found!");
    process.exit(1);
  }
  
  const clusters = user.seoClusters || [];
  console.log(`\n📅 RAW CLUSTERS FOR: (${user.targetDomain}): ${clusters.length} items found.`);
  
  // Categorize
  const grouped = {};
  clusters.forEach(c => {
    const type = c.type || c.category || 'unknown';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(`${c.keyword} [Status: ${c.status}] [Scheduled: ${c.scheduledTime ? new Date(c.scheduledTime).toLocaleDateString() : 'N/A'}]`);
  });
  
  for (const [type, items] of Object.entries(grouped)) {
     console.log(`\n--- ${type.toUpperCase()} (${items.length}) ---`);
     items.slice(0, 15).forEach(i => console.log(i));
     if (items.length > 15) console.log(`... and ${items.length - 15} more.`);
  }
  
  process.exit(0);
}
getCalendar();
