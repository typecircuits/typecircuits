#!/bin/bash -e

./setup.sh
(cd core && npm run build)
(cd app && npm run build)
(cd functions && npm run build)
