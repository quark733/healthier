#!/usr/bin/env python3
"""Send StrengthLog sessions, as a Claude session read them, to your HealthCheck dashboard.

Run it in a Claude session right after calling StrengthLog's get_sessions tool. It finds the
tool's replies in this session's own log and sends them exactly as StrengthLog wrote them, so
nothing is retyped on the way. Text files given as arguments are sent instead.

  HEALTHCHECK_KEY=hc_... python3 -I push-strengthlog.py
  HEALTHCHECK_KEY=hc_... python3 -I push-strengthlog.py replies.txt

HEALTHCHECK_URL overrides the address (default https://halsa.almohtasib.se).
"""
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("HEALTHCHECK_URL", "https://halsa.almohtasib.se").rstrip("/") + "/api/strength-ingest"
KEY = os.environ.get("HEALTHCHECK_KEY", "").strip()


def texts_in(content):
    if isinstance(content, str):
        yield content
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    yield item.get("text", "")
                elif "content" in item:
                    yield from texts_in(item["content"])


def replies_from_logs(max_age_s=6 * 3600):
    """get_sessions replies in the Claude session logs written in the last few hours, newest log first."""
    logs = glob.glob(os.path.expanduser("~/.claude/projects/**/*.jsonl"), recursive=True)
    logs = [p for p in logs if time.time() - os.path.getmtime(p) < max_age_s]
    logs.sort(key=os.path.getmtime, reverse=True)
    found = {}
    for path in logs[:3]:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    msg = json.loads(line).get("message") or {}
                except ValueError:
                    continue
                content = msg.get("content")
                if not isinstance(content, list):
                    continue
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        for text in texts_in(block.get("content")):
                            if text.startswith("sessions | ") or text.strip() == "no sessions in range":
                                found[text.split("\n", 1)[0]] = text
        if found:
            break
    return list(found.values())


def main():
    if not KEY:
        sys.exit("Set HEALTHCHECK_KEY to the sync key from the Training page.")
    if len(sys.argv) > 1:
        texts = [open(p, encoding="utf-8").read() for p in sys.argv[1:]]
    else:
        texts = replies_from_logs()
    texts = [t for t in texts if t.startswith("sessions | ")]
    if not texts:
        print("No sessions to send (StrengthLog had none in the range, or get_sessions wasn't called).")
        return
    req = urllib.request.Request(
        URL,
        data=json.dumps({"texts": texts}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print("Sent:", r.status, r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"The dashboard refused it: {e.code} {e.read().decode()}")


if __name__ == "__main__":
    main()
