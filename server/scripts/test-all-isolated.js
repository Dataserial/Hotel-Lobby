const { spawnSync } = require('child_process');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');

async function main() {
  const root = path.join(__dirname, '..');
  const jest = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
  const run = (script, args, env) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', timeout: 180000 });
    if (result.status !== 0) throw new Error(`${script} failed with status ${result.status}`);
  };
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
      run(require.resolve('prisma/build/index.js'), ['db', 'push'], env);
      run(jest, ['--runInBand', '--silent', '--testTimeout=30000', '--runTestsByPath', file, ...(pattern ? [`--testNamePattern=${pattern}`] : [])], env);
    } finally {
      await mongo.stop();
    }
  }
  run(jest, ['--runInBand', '--silent', '--runTestsByPath', 'tests/task12-http.test.js'], process.env);
  run(jest, ['--runInBand', '--silent', '--testTimeout=30000', '--runTestsByPath',
    'tests/task3-invariants.test.js', 'tests/task3-service.test.js', 'tests/task3-http.test.js',
    'tests/task3-race.test.js'], process.env);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
