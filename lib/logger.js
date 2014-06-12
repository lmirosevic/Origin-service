//
//  logger.js
//  origin-service
//
//  Created by Luka Mirosevic on 12/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var winston = require('winston'),
    Logentries = require('winston-logentries'),
    nconf = require('nconf'),
    path = require('path');

logentriesAccountKey = nconf.get('LOGENTRIES_ACCOUNT_KEY');

// basic transports
transports = [
  new winston.transports.Console({level: 'info'}),
  // new winston.transports.File({filename: path.join(__dirname, '../log/node.log'), level: 'info'}),
];

// additional transports
if (logentriesAccountKey) transports.push(new winston.transports.Logentries({token: logentriesAccountKey, level: 'info'}));

// set up the logger
var logger = new (winston.Logger)({
  transports: transports
});

// export it out
module.exports = logger;
