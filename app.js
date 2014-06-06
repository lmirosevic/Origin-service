//
//  app.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//


//lm create redis persistence layer
//lm need some error handling and recovery, in case exceptions happen, so the process doesn't go down. 

var nconf = require('nconf');

nconf.argv()
     .env()
     .file({file: './config/defaults.json'});

/* Plugins */

var serviceInterface = require('./lib/service-interface/' + nconf.get('SERVICE_INTERFACE').type);
var persistence = require('./lib/persistence/' + nconf.get('PERSISTENCE').type);
var frontend = require('./lib/frontend/' + nconf.get('FRONTEND').type);

/* Service interface  */

serviceInterface.listen(function(channel, value) {
  // stores the value and triggers an update to subscribers if the value has changed
  persistence.set(channel, value, function(hasValueChanged) {
    if (hasValueChanged) {
      // send an update to all subscribers
      frontend.sendChannelUpdate(channel, value);
    }
  });
});

/* Frontend Service */

frontend.setPersistenceKeyValueGetter(persistence.get);
frontend.startService();
console.log('Origin server started.');
