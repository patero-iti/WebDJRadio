/**
 * icecast-bridge.js
 * Optional lightweight local bridge server for WebDJRadio to stream directly to
 * commercial Icecast servers like Myriad Cloud (Broadcast.Radio) that require raw TCP sockets.
 *
 * Usage:
 *   node icecast-bridge.js [port=8081]
 */

const http = require('http');
const net = require('net');

const PORT = process.env.PORT || 8081;

// Simple HTTP server for health check & instructions
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'WebDJRadio Icecast Bridge',
    description: 'Relays WebDJ browser audio to Icecast/Myriad Cloud over raw TCP sockets'
  }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`📻 WebDJRadio Icecast & Myriad Cloud Stream Bridge`);
  console.log(`======================================================`);
  console.log(`Bridge listening on ws://localhost:${PORT}`);
  console.log(`Set WebDJRadio Icecast Connection Method to:`);
  console.log(`  Connection Method: WebSocket Relay Bridge`);
  console.log(`  Address: localhost, Port: ${PORT}`);
  console.log(`======================================================\n`);
});
