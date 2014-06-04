#! /bin/sh

node ./node_modules/nodemon/bin/nodemon.js --watch app.js --watch lib --watch config -e js,json app.js
