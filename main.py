from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class ProjectHandler(SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, directory=str(ROOT), **kwargs)


if __name__ == "__main__":
	server = ThreadingHTTPServer(("localhost", 8000), ProjectHandler)
	print("Visualisation disponible sur http://localhost:8000")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nServeur arrêté.")
	finally:
		server.server_close()
