const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true');

  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });

    if (hello.setName === 'rs0') {
      console.log('Local MongoDB replica set rs0 is ready.');
      return;
    }

    if (hello.setName) {
      throw new Error(`Port 27018 belongs to replica set ${hello.setName}, not rs0.`);
    }

    await admin.command({
      replSetInitiate: {
        _id: 'rs0',
        members: [{ _id: 0, host: '127.0.0.1:27018' }],
      },
    });
    console.log('Local MongoDB replica set rs0 initialized.');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
