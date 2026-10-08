// Real TCP HTTP client in a separate process, without Supertest.
const { spawn } = require('child_process');
const app = require('../app');
const prisma = require('../lib/prisma');
const server = app.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = `
    (async () => {
      const base = process.argv[1];
      const ready = await fetch(base+'/ready');
      if (ready.status !== 200) throw new Error('Database not ready');
      const response = await fetch(base+'/api/public/rooms/availability?checkInDate=2027-01-01&checkOutDate=2027-01-02&guestCount=1');
      if (response.status !== 200) throw new Error('Public HTTP failed');
      const data = await response.json();
      const fields = ['capacity','pricePerNight','roomId','roomNumber','roomType'];
      for (const room of data.items) if (JSON.stringify(Object.keys(room).sort()) !== JSON.stringify(fields)) throw new Error('Unexpected public field');
      console.log(JSON.stringify({ readiness: 'ready', status: response.status, total: data.total, publicFieldsVerified: true }));
    })().catch(e => { console.error(e.message); process.exitCode = 1; });
  `;
  const child = spawn(process.execPath, ['-e', source, base], { env: process.env, stdio: 'inherit' });
  const deadline = setTimeout(() => { child.kill(); }, 15000);
  child.once('close', async code => {
    clearTimeout(deadline);
    server.close(); server.closeAllConnections?.();
    await prisma.$disconnect();
    process.exitCode = code === 0 ? 0 : 1;
  });
});
