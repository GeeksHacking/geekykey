#!/usr/bin/env bash
# Times cold starts of event-service-staging (BAC-12). Each round waits until
# the running instance has stopped (our server logs server_stopping), sends
# one request, then checks the logs for a new server_started line, which says
# the request did start an instance. Rounds alternate a tap and GET /api/health.
# Since BAC-29 those are JSON log lines; the 11 Oct runs looked for the plain
# text "SIGTERM: stopping" and "Listening on" lines the server wrote then.
#
# The tap carries a made-up station key, so it answers invalid_station_key
# after one station lookup: it opens the first TiDB connection, as a real tap
# does, but skips the tap's own transaction (68 to 92 ms warm, BAC-19).
#
#   .scratch/db-hosting/assets/cold-start.sh LABEL ROUNDS [SINCE] >> results.tsv
#
# LABEL names the setting under test, such as boost-on. SINCE, a UTC time such
# as 2026-10-10T15:12:27Z, is when the last request was sent, if the instance
# may already have stopped; it defaults to now. Needs gcloud signed in
# with Logs Viewer on geekykey-b035a. Prints one tab-separated line a round:
# label, request, UTC time, cold (yes/no), seconds to first byte and in all at
# curl (DNS and a new TLS handshake included), and Cloud Run's own latency from
# its request log. If gcloud's sign-in expires, it stops rather than wait on.
set -euo pipefail

label=$1
rounds=$2
since=${3:-$(date -u +%FT%TZ)}
url=https://event-service-staging-468223998400.asia-southeast1.run.app
service='resource.type="cloud_run_revision" AND resource.labels.service_name="event-service-staging"'

# Prints how many of our log lines since $1 are named $2.
count_since() {
  local ids
  ids=$(gcloud logging read "$service AND timestamp>=\"$1\" AND jsonPayload.message=\"$2\"" \
    --limit=10 --format="value(insertId)") || return 1
  grep -c . <<<"$ids" || true
}

# Prints Cloud Run's latency for the first request since $1, in seconds.
latency_since() {
  local latency
  latency=$(gcloud logging read "$service AND timestamp>=\"$1\" AND logName:\"requests\"" \
    --limit=1 --order=asc --format="value(httpRequest.latency)") || return 1
  echo "${latency%s}"
}

wait_until_stopped() {
  local since=$1
  local stopped
  for _ in $(seq 1 40); do
    stopped=$(count_since "$since" server_stopping)
    [ "$stopped" -gt 0 ] && return 0
    sleep 60
  done
  echo "no SIGTERM within 40 minutes of $since" >&2
  return 1
}

send() {
  local fmt='%{time_starttransfer}\t%{time_total}'
  if [ "$1" = health ]; then
    curl -sS -o /dev/null -w "$fmt" "$url/api/health"
  else
    curl -sS -o /dev/null -w "$fmt" -X POST "$url/api/v1/taps" \
      -H "Authorization: Bearer gk_sta_coldstart$(openssl rand -hex 12)" \
      -H 'Content-Type: application/json' \
      -d '{"taps":[{"uid":"04AABBCCDDEEFF","client_tap_id":"bac12-cold","tapped_at":"2026-10-10T00:00:00Z"}]}'
  fi
}

last=$since
for i in $(seq 1 "$rounds"); do
  wait_until_stopped "$last"
  sleep 5
  kind=$([ $((i % 2)) -eq 1 ] && echo tap || echo health)
  at=$(date -u +%FT%TZ)
  times=$(send "$kind")
  sleep 90 # for the logs to arrive
  started=$(count_since "$at" server_started)
  cold=$([ "$started" -gt 0 ] && echo yes || echo no)
  latency=$(latency_since "$at")
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$label" "$kind" "$at" "$cold" "$times" "$latency"
  last=$at
done
