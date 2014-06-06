//
//  Redis.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    redis = require('redis'),
    toolbox = require('gb-toolbox'),
    url = require('url');

var options = nconf.get('PERSISTENCE').options;

/* Connection */

var parsedUrl = url.parse(options.url);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
console.log('Attempting connection to Redis for Persistence...');
var client = redis.createClient(connectionOptions.port, connectionOptions.host, {retry_max_delay: options.maxReconnectionTimeout});
if (connectionOptions.password) client.auth(connectionOptions.password);
if (connectionOptions.database) client.select(connectionOptions.database);
// client.on('error', function(err) {
//     console.error('Error occured on Persistence Redis', err);
// });
client.on('reconnecting', function(err) {
  console.log('Attempting reconnection to Redis for Persistence...');
});

var P = function() {
  this.pack = function(object) {
    return JSON.stringify(object);
  };

  this.unpack = function(raw) {
    return JSON.parse(raw);
  };
};
var p = new P();

var RedisPersistence = function() {
  /**
   Sets a key in the cache and sends true in the callback if it was updated, and false if it stayed the same.
   */
  this.set = function(key, value, callback) {
    var packedValue = p.pack(value);
    client.getset(key, packedValue, function(err, oldPackedValue) {
      // unpack and compare the old value to the new
      var oldValue = p.unpack(oldPackedValue);
      var changed = !_.isEqual(value, oldValue);

      // call back
      toolbox.callCallback(callback, changed);
    });
  };

  /**
   Gets a value for the key from the cache
   */
  this.get = function(key, callback) {
    client.get(key, function(err, packedValue) {
      // unpack the value
      var value = p.unpack(packedValue);

      // call back
      toolbox.callCallback(callback, value);
    });
  };
};
var redisPersistence = module.exports = new RedisPersistence();
