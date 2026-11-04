#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js and npm are required. On Mac, run Start Study Orbit.command from the project folder. On Fedora: sudo dnf install nodejs npm' >&2
  exit 1
fi

# Vite 6 needs modern Node.js (v20+ or v22+ recommended).
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(!(major>20||(major===20&&minor>=19))){console.error("Please install Node.js >=20.19 (Node 22 LTS recommended)");process.exit(1)}'

# Use the default API port required by the Vite proxy.
if [[ ${STUDY_ORBIT_API_PORT:-8766} != 8766 ]]; then
  echo 'run.sh requires STUDY_ORBIT_API_PORT=8766 (the Vite proxy port).' >&2
  exit 1
fi
# Check both ports before starting either child; do not reuse an unrelated service.
node --input-type=module <<'JS'
import net from 'node:net';
try {
for (const port of [8766, 5173]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the existing service and retry.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
} catch (error) {
  console.error(`Study Orbit could not start: ${error.message}`);
  process.exit(1);
}
JS
# Check actual native packages before starting either service; folder checks alone miss broken Mac installs.
node scripts/ensure-dependencies.mjs
api_pid=''
web_pid=''
cleanup() {
  trap - EXIT INT TERM
  echo -e '\nStopping Study Orbit...'
  if [[ -n $api_pid ]]; then kill "$api_pid" 2>/dev/null || true; fi
  if [[ -n $web_pid ]]; then kill "$web_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node server/index.js & api_pid=$!
node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort & web_pid=$!

url='http://127.0.0.1:5173/'
ready=false
for ((attempt=0; attempt<100; attempt++)); do
  if command -v curl >/dev/null 2>&1 && curl --silent --fail 'http://127.0.0.1:8766/api/health' >/dev/null && curl --silent --fail "$url" >/dev/null; then ready=true; break; fi
  if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$web_pid" 2>/dev/null; then echo 'A Study Orbit process failed to start.' >&2; exit 1; fi
  sleep 0.15
done
if [[ $ready != true ]]; then
  echo 'Study Orbit did not become ready within 15 seconds. Check the errors above and confirm curl is installed.' >&2
  exit 1
fi
if [[ $(uname -s) == Darwin ]]; then
  # macOS open uses the user's default browser, without assuming Safari or Chrome.
  if ! open "$url"; then echo "Could not open the browser. Open $url manually." >&2; fi
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 || true
elif command -v firefox >/dev/null 2>&1; then
  firefox "$url" >/dev/null 2>&1 &
fi
printf '\nStudy Orbit: %s\nState folder: %s\nBackups folder: %s\nPress Ctrl+C to stop.\n' "$url" "${STUDY_ORBIT_DATA_ROOT:-$PWD}/Current_State" "${STUDY_ORBIT_DATA_ROOT:-$PWD}/Backups"
# A child exiting while the launcher is active is unexpected; preserve failure status.
set +e
# macOS ships Bash 3.2, which has no wait -n. Monitor only the children we started.
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 0.5
done
if ! kill -0 "$api_pid" 2>/dev/null; then wait "$api_pid"; else wait "$web_pid"; fi
status=$?
echo 'A Study Orbit service stopped. See the errors above; restart with ./run.sh.' >&2
if [[ $status == 0 ]]; then status=1; fi
exit "$status"
