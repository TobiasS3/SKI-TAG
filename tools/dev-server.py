# Lokaler Test-Server ohne Browser-Cache – jede Änderung ist nach dem Neuladen sofort da.
# Start:  python3 tools/dev-server.py        → http://localhost:5599 (auch im WLAN fürs Handy)

import http.server
import os
import socketserver

PORT = 5599


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


os.chdir(os.path.join(os.path.dirname(__file__), '..'))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), NoCache) as httpd:
    print(f'Ski Tag läuft auf http://localhost:{PORT}')
    httpd.serve_forever()
