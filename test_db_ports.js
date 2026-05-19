require('dotenv').config();
const net = require('net');

const HOST = 'db.jnwmvsoqcfpcxkuaxsdj.supabase.co';
const PORTS = [5432, 6543];

console.log(`Testing TCP connectivity to ${HOST}...\n`);

function testPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      console.log(`  ✅  Port ${port}: REACHABLE`);
      socket.destroy();
      resolve({ port, ok: true });
    });

    socket.on('timeout', () => {
      console.log(`  ❌  Port ${port}: TIMEOUT (blocked by firewall/ISP)`);
      socket.destroy();
      resolve({ port, ok: false, reason: 'timeout' });
    });

    socket.on('error', (err) => {
      console.log(`  ❌  Port ${port}: ERROR – ${err.message}`);
      socket.destroy();
      resolve({ port, ok: false, reason: err.message });
    });

    socket.connect(port, HOST);
  });
}

async function main() {
  const results = [];
  for (const port of PORTS) {
    results.push(await testPort(port));
  }

  console.log('\n--- Summary ---');
  const reachable = results.filter((r) => r.ok);
  if (reachable.length === 0) {
    console.log('❌  Neither port is reachable from this machine.');
    console.log('   → Check your internet connection or ISP firewall.');
    console.log('   → Try connecting via a different network (mobile hotspot).');
  } else {
    reachable.forEach((r) => {
      console.log(`✅  Use port ${r.port} in your DATABASE_URL`);
    });
  }
}

main();
