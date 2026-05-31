#!/usr/bin/env bash
set -euo pipefail

PUSH=false
for arg in "$@"; do
  [[ "$arg" == "--push" ]] && PUSH=true
done

VERSION=$(git describe --tags --abbrev=0)
REGISTRY="ghcr.io/nikkopg/old-legs"

echo "Building Old Legs $VERSION..."

docker build -t "${REGISTRY}/api:${VERSION}" -t "${REGISTRY}/api:latest" ./apps/api
docker build -t "${REGISTRY}/web:${VERSION}" -t "${REGISTRY}/web:latest" ./apps/web

echo "Done. Images tagged as $VERSION and latest."

if $PUSH; then
  echo ""
  echo "Pushing to ${REGISTRY}..."
  # Requires: echo YOUR_PAT | docker login ghcr.io -u nikkopg --password-stdin
  docker push "${REGISTRY}/api:${VERSION}"
  docker push "${REGISTRY}/api:latest"
  docker push "${REGISTRY}/web:${VERSION}"
  docker push "${REGISTRY}/web:latest"
  echo "Pushed $VERSION to ${REGISTRY}."
else
  echo ""
  echo "To push: ./scripts/build.sh --push"
  echo "  (requires: echo YOUR_PAT | docker login ghcr.io -u nikkopg --password-stdin)"
fi
