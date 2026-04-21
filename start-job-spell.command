#!/bin/zsh
cd /Users/naduxa/Documents/site-want-work
/Applications/Codex.app/Contents/Resources/node /Users/naduxa/Documents/site-want-work/server.js >/tmp/job-spell.log 2>&1 &
sleep 2
open http://127.0.0.1:3000
