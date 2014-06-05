//
//  InMemory.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var cache = {};

var InMemoryPersistence = function() {
  /**
   Sets a key in the cache and sends true in the callback if it was updated, and false if it stayed the same.
   */
  this.set = function(key, value, callback) {
    if (cache[key] == value) {
      toolbox.callCallback(callback, false);
    }
    else {
      cache[key] = value;
      toolbox.callCallback(callback, true);
    }
  };

  this.get = function(key) {
    return cache[key];
  };
};
var inMemoryPersistence = module.exports = new InMemoryPersistence();