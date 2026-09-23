#!/bin/sh
set -eu
TARGET="${MCP_INTERNAL_HOST:-metza12-rht-mcp.internal}"
# Remotely-managed tunnel ingress still points at http://mcp:8787 (compose
# service name). Alias that hostname to the Fly private address of the MCP app.
ip="$(nslookup "$TARGET" 2>/dev/null | awk '/^Address: / && $2 !~ /#/ {print $2; exit}')"
if [ -z "${ip:-}" ]; then
  ip="$(getent hosts "$TARGET" 2>/dev/null | awk '{print $1; exit}')"
fi
if [ -n "${ip:-}" ]; then
  echo "$ip mcp" >> /etc/hosts
  echo "mapped mcp -> $ip ($TARGET)"
else
  echo "WARN: could not resolve $TARGET" >&2
fi
exec /usr/local/bin/cloudflared --no-autoupdate tunnel run --token "${CLOUDFLARE_TUNNEL_TOKEN}"
