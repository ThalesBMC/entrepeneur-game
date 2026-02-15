#!/bin/bash
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
cd "$HOME"
exec "$HOME/.bun/bin/bun" "$HOME/questgame/cli.ts" serve
