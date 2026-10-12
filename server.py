import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DATABASE = ROOT / "lexcitizen.db"


def setup_database():
    with sqlite3.connect(DATABASE) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_sign_in TEXT NOT NULL
            )"""
        )


def hash_password(password):
    salt = secrets.token_bytes(16)
    derived_key = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${derived_key.hex()}"


class LexCitizenHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/sign-in":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            name = str(payload.get("name", "")).strip()
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))
            if not name or "@" not in email or len(password) < 8:
                self.respond({"error": "Enter your name, a valid email, and a password of at least 8 characters."}, 400)
                return
            now = datetime.now(timezone.utc).isoformat()
            with sqlite3.connect(DATABASE) as connection:
                existing = connection.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
                if existing:
                    connection.execute(
                        "UPDATE users SET name = ?, password_hash = ?, last_sign_in = ? WHERE email = ?",
                        (name, hash_password(password), now, email),
                    )
                    message = "Welcome back. Your sign-in was saved."
                else:
                    connection.execute(
                        "INSERT INTO users (name, email, password_hash, created_at, last_sign_in) VALUES (?, ?, ?, ?, ?)",
                        (name, email, hash_password(password), now, now),
                    )
                    message = "Your account was created and sign-in was saved."
            self.respond({"message": message}, 201)
        except (ValueError, json.JSONDecodeError, sqlite3.Error):
            self.respond({"error": "We could not save that sign-in. Please try again."}, 400)

    def respond(self, payload, status):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    setup_database()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), LexCitizenHandler)
    print("LexCitizen running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
