FROM cloudflare/cloudflared:2026.8.3 AS cf

FROM alpine:3.20
RUN apk add --no-cache bind-tools
COPY --from=cf /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
