const { connectDatabase, mongoose } = require('../config/database');
const { syncCentralActs } = require('../modules/central-acts-sync');

async function main() {
  await connectDatabase();
  try {
    await syncCentralActs();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('India Code sync command failed:', error);
  process.exitCode = 1;
});
