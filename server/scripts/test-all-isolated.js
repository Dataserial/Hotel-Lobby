const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');

async function main() {
  const root = path.join(__dirname, '..');
  const jest = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
  // Keep the event loop free to drain the temporary mongod process's pipes.
  // spawnSync(Jest) can fill those pipes and stall new MongoDB handshakes.
  const run = (script, args, env) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out`)); }, 180000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with status ${code}`));
    });
  });
  const suites = [
    ['tests/booking-validation.test.js'],
    ['tests/availability-service.test.js'],
    ['tests/booking-service.test.js', '^(?!two concurrent|keeps the original)'],
    ['tests/booking-service.test.js', 'keeps the original'],
    ['tests/booking-service.test.js', 'two concurrent'],
  ];
  for (const [file, pattern] of suites) {
    const mongo = await MongoMemoryReplSet.create({
      binary: process.env.MONGOD_PATH ? { systemBinary: process.env.MONGOD_PATH } : undefined,
      replSet: { count: 1, name: 'step9set', storageEngine: 'wiredTiger' },
    });
    try {
      const url = mongo.getUri('hotel_lobby_step9_test');
      if (!/\/hotel_lobby_step9_test\?/.test(url)) throw new Error('Unsafe test database URL');
      const env = { ...process.env, DATABASE_URL: url };
      await run(require.resolve('prisma/build/index.js'), ['db', 'push', '--skip-generate'], env);
      await run(jest, ['--runInBand', '--silent', '--testTimeout=30000', '--runTestsByPath', file, ...(pattern ? [`--testNamePattern=${pattern}`] : [])], env);
    } finally {
      await mongo.stop();
    }
  }
  await run(jest, ['--runInBand', '--silent', '--runTestsByPath', 'tests/task12-http.test.js'], process.env);
  await run(jest, ['--runInBand', '--silent', '--testTimeout=30000', '--runTestsByPath',
    'tests/task3-invariants.test.js', 'tests/task3-service.test.js', 'tests/task3-http.test.js',
    'tests/task3-race.test.js', 'tests/task3-claims.test.js'], process.env);
  await run(jest, ['--runInBand', '--silent', '--testTimeout=30000', '--runTestsByPath',
    'tests/payment-ledger.test.js', 'tests/task4-reconciliation.test.js', 'tests/task4-payment.test.js',
    'tests/task4-booking.test.js', 'tests/task4-stay.test.js', 'tests/task4-http.test.js',
    'tests/task4-atomic.test.js'], process.env);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
