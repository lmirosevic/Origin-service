//
//  Resque.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    toolbox = require('gb-toolbox'),
    coffeeResque = require('coffee-resque'),
    url = require('url'),
    clc = require('cli-color');

var options = nconf.get('SERVICE_INTERFACE').options;

/* Connection */

var parsedUrl = url.parse(options.redis);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
console.log('Attempting connection to Redis for Origin interface...');
var resque = coffeeResque.connect(connectionOptions);
// resque.redis.on('error', function(err) {
//     console.error('Error occured on Origin interface Redis', err);
// });
resque.redis.on('reconnecting', function(err) {
  console.log('Attempting reconnection to Redis for Origin interface...');
});
resque.redis.retry_max_delay = options.maxReconnectionTimeout;

/* Main code */

var ResqueImplementation = function() {
  this.listen = function(callback) {
    toolbox.requiredArguments(callback);

    var worker = resque.worker(options.queue, {
      OriginUpdateJob: function(input, resqueueCallback) {
        var channel = input.channel;
        var value = input.value;

        // Log to console
        if (options.logUpdates) {
          console.log('>>> ' + clc.blue(channel));
          console.log(JSON.stringify(value));
        }

        // emit the data out onto the listener
        toolbox.callCallback(callback, channel, value);

        // signify that the job is done
        toolbox.callCallback(resqueueCallback);
      }
    });

    worker.start();
  };
};
var resqueImplementation = module.exports = new ResqueImplementation();

// Payload format (ingress)
//
// {
//   channel: 'wcsg.score.crovsbra',    // any unique string
//   value: _                           // any valid JSON object
// }
