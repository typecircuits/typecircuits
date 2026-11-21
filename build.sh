#!/bin/bash -e

./setup.sh
(cd app && npm run build)
(cd functions && npm run build)
