const { start } = require('./src/server');

start().catch((error) => {
  console.error('Unable to start LexCitizen:', error);
  process.exitCode = 1;
});
