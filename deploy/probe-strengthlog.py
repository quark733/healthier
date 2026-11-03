#!/usr/bin/env python3
"""Visar hur StrengthLogs MCP-server vill att en klient loggar in. Skickar inga
uppgifter om dig; läser bara serverns offentliga inloggningsbeskrivning."""
import json
import urllib.error
import urllib.request

BASE = "https://mcp.strengthlog.com"


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, dict(r.headers), r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode(errors="replace")
    except Exception as e:  # noqa: BLE001
        return None, {}, str(e)


init = json.dumps({
    "jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "probe", "version": "0"}},
}).encode()
s, h, b = call(BASE + "/mcp", init, {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
print("== POST /mcp utan inloggning:", s)
print("WWW-Authenticate:", h.get("WWW-Authenticate") or h.get("www-authenticate"))

servers = []
for path in ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]:
    s, _, b = call(BASE + path)
    print("==", path, s)
    if s == 200:
        print(b[:1500])
        try:
            servers = json.loads(b).get("authorization_servers", []) or servers
        except ValueError:
            pass

for auth in servers or [BASE]:
    for path in ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]:
        s, _, b = call(auth.rstrip("/") + path)
        print("==", auth + path, s)
        if s == 200:
            try:
                m = json.loads(b)
                for k in ["issuer", "authorization_endpoint", "token_endpoint", "registration_endpoint",
                          "client_id_metadata_document_supported", "grant_types_supported",
                          "token_endpoint_auth_methods_supported", "code_challenge_methods_supported",
                          "scopes_supported"]:
                    print(f"  {k}: {m.get(k)}")
            except ValueError:
                print(b[:800])
            break
