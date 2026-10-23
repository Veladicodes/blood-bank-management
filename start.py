#!/usr/bin/env python3
"""One-command launcher for the Blood Bank Management System.

Usage:
    python start.py              install deps if needed, pick a database, start the server, open the browser
    python start.py --test       run the automated test suite instead
    python start.py --seed       load sample data into the database in MONGO_URI, then exit
    python start.py --memory     force the temporary in-memory database (no MongoDB needed)
    python start.py --port 8080  use another port
    python start.py --no-browser don't open the browser

Database choice (in order):
    1. --memory flag, or USE_MEMORY_DB=true in backend/.env  -> in-memory database with sample data
    2. MONGO_URI in backend/.env is reachable                -> use it (Atlas or local MongoDB)
    3. otherwise                                             -> fall back to the in-memory database
backend/.env is never modified except to be created from backend/.env.example on first run.
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / "backend" / ".env"
ENV_EXAMPLE = ROOT / "backend" / ".env.example"


def info(msg):
    print(f"[start] {msg}", flush=True)


def fail(msg, code=1):
    print(f"[start] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def read_env(path):
    """Parse a simple KEY=VALUE file (comments and blank lines ignored)."""
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def find_tool(name):
    # On Windows npm is npm.cmd; shutil.which resolves that.
    path = shutil.which(name)
    if not path:
        fail(f"'{name}' was not found. Install Node.js LTS from https://nodejs.org and reopen your terminal.")
    return path


def check_node(node):
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    major = int(out.lstrip("v").split(".")[0] or 0)
    if major < 18:
        fail(f"Node.js {out} is too old; version 18 or newer is required.")
    info(f"Node.js {out}")


def ensure_env():
    if not ENV_FILE.exists():
        if not ENV_EXAMPLE.exists():
            fail("backend/.env.example is missing; cannot create backend/.env.")
        shutil.copy(ENV_EXAMPLE, ENV_FILE)
        info("Created backend/.env from backend/.env.example")


def ensure_dependencies(npm):
    if (ROOT / "node_modules" / "express").exists():
        return
    info("Installing dependencies (npm install) ...")
    if subprocess.run([npm, "install"], cwd=ROOT).returncode != 0:
        fail("npm install failed. Check your internet connection and try again.")


def mongo_reachable(uri, timeout=3.0):
    """True if the MongoDB server in the URI accepts a TCP connection."""
    if not uri:
        return False
    if uri.startswith("mongodb+srv://"):
        # Atlas SRV hosts resolve through DNS; a plain TCP check isn't meaningful, so trust it.
        return True
    parsed = urlparse(uri)
    host, port = parsed.hostname or "127.0.0.1", parsed.port or 27017
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) != 0


def choose_database(env, force_memory):
    """Return the environment overrides for the server process."""
    if force_memory or env.get("USE_MEMORY_DB", "").lower() == "true":
        info("Database: temporary in-memory MongoDB with sample data (resets on restart)")
        return {"USE_MEMORY_DB": "true"}
    uri = env.get("MONGO_URI", "")
    if mongo_reachable(uri):
        shown = uri.split("@")[-1] if "@" in uri else uri  # never print credentials
        info(f"Database: MongoDB at {shown}")
        return {"USE_MEMORY_DB": "false"}
    info("MongoDB at MONGO_URI is not reachable; falling back to the in-memory database.")
    info("(To use a real database, start MongoDB or put your Atlas string in backend/.env as MONGO_URI.)")
    return {"USE_MEMORY_DB": "true"}


def open_browser_when_ready(port):
    url = f"http://localhost:{port}"
    for _ in range(120):  # the first run may download an in-memory MongoDB binary
        time.sleep(1)
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=2) as r:
                if r.status == 200:
                    info(f"Ready: {url}")
                    webbrowser.open(url)
                    return
        except Exception:
            continue


def main():
    parser = argparse.ArgumentParser(description="Blood Bank Management launcher")
    parser.add_argument("--test", action="store_true", help="run the test suite and exit")
    parser.add_argument("--seed", action="store_true", help="seed sample data into MONGO_URI and exit")
    parser.add_argument("--memory", action="store_true", help="force the in-memory database")
    parser.add_argument("--port", type=int, help="server port (default: PORT in backend/.env or 5000)")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    args = parser.parse_args()

    os.chdir(ROOT)
    node, npm = find_tool("node"), find_tool("npm")
    check_node(node)
    ensure_env()
    ensure_dependencies(npm)

    if args.test:
        info("Running tests ...")
        sys.exit(subprocess.run([npm, "test"], cwd=ROOT).returncode)

    env = read_env(ENV_FILE)
    child_env = os.environ.copy()

    if args.seed:
        if not mongo_reachable(env.get("MONGO_URI", "")):
            fail("MONGO_URI is not reachable. Start MongoDB or set an Atlas connection string in backend/.env.")
        sys.exit(subprocess.run([npm, "run", "seed"], cwd=ROOT, env=child_env).returncode)

    child_env.update(choose_database(env, args.memory))
    port = args.port or int(env.get("PORT", "5000") or 5000)
    if not port_free(port):
        fail(f"Port {port} is already in use. Close the other program or run: python start.py --port {port + 1}")
    child_env["PORT"] = str(port)

    if env.get("ADMIN_PASSWORD", "admin123") == "admin123":
        info("Note: default admin password in use (admin / admin123). Change ADMIN_PASSWORD in backend/.env before submitting.")
    info("Starting server. Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Thread(target=open_browser_when_ready, args=(port,), daemon=True).start()

    proc = subprocess.Popen([npm, "start"], cwd=ROOT, env=child_env)
    try:
        sys.exit(proc.wait())
    except KeyboardInterrupt:
        info("Stopping ...")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        sys.exit(0)


if __name__ == "__main__":
    main()
