import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({ ws: true });

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/ws/') || req.url === '/health' || req.url === '/metrics') {
    proxy.web(req, res, { target: 'http://localhost:3001' });
  } else {
    proxy.web(req, res, { target: 'http://localhost:3000' });
  }
});

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/ws/')) {
    proxy.ws(req, socket, head, { target: 'http://localhost:3001' });
  }
});

server.listen(3080, () => {
  console.log('Reverse proxy on http://localhost:3080');
  console.log('  /api/* /ws/* /health /metrics → backend :3001');
  console.log('  everything else → frontend :3000');
});
