FROM caddy:2-alpine

WORKDIR /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html content.js script.js theme-init.js style.css robots.txt ./
COPY assets/ ./assets/

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
