//
//  app.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//


//router
//should bind on some port
//it keeps a mapping of channel -> subcriber
//it lazy creates and returns a delayed unsubscribe function and maps it to the subscriber (which when executed removes the subscriber from all channels, and removes itself from the list of cleaners) uses debounce for this

//when it receives something upstream, it sends an update to all clients for that particular channel and caches the LCV


//lm decouple the persistence layer like in the other node services
//lm create redis persistence layer
//lm provide resque based interface and lib for upstream commands
//lm need some error handling and recovery, in case exceptions happen, so the process doesn't go down. 


var nconf = require('nconf'),
    zmq = require('zmq'),
    msgpack = require('msgpack'),
    _ = require('underscore'),
    toolbox = require('gb-toolbox');

nconf.argv()
     .env()
     .file({file: './config/defaults.json'});

// create a router socket
var socket = zmq.socket('router');

// some in memory storage
var channels = {};
var cleaners = {};


var InMemoryPersistence = function() {
  var cache = {};

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
var persistence = new InMemoryPersistence();

var P = function() {
  /**
   Subscribe a client to a particular channel
   */
  this.subscribeClientOnChannel = function(client, channel) {
    // lazy create the channel
    if (_.isUndefined(channels[channel])) {
      channels[channel] = [];
    }

    // add the subscriber idempotently
    var subscribers = channels[channel];
    toolbox.addToSet(subscribers, client);
  };  

  /**
   Unsubscribes a client from all channels
   */
  this.unsubscribeClientFromAllChannels = function(client) {
    _.each(channels, function(subscribers, channel) {
      p.unsubscribeClientFromChannel(client, channel);
    });
  };

  /**
   Unsubscribes a client from a particular channel
   */
  this.unsubscribeClientFromChannel = function(client, channel) {
    if (channels[channel]) {
      var subscribers = channels[channel];
      toolbox.removeFromArray(subscribers, client);
    }
  };

  /**
   Refreshes the subscription timeout interval for a client
   */
  this.refreshSubscriptionKeepaliveForClient = function(client) {
    // check if there is already a cleanup function, and if not create it
    if (_.isUndefined(cleaners[client])) {
      // this is the cleanup function
      cleaners[client] = function() {
        // removes the subscriber from all the channels
        p.unsubscribeClientFromAllChannels(client);

        // cleanes up self
        delete cleaners[client];
      };
    }

    // debounces the function so that it only ends up executing once the keepalives expire
    _.debounce(cleaners[client], ncong.get('SUBSCRIPTION_KEEPALIVE_TIMEOUT') * 1000);
  };

  /**
   Sends an Origin packet to the client, serialised with msgpack
   */
  this.sendOriginPacketToClient = function(client, originPacket) {
    // client:Buffer
    // originPacket:Object

    // pack the originPacket
    var rawOriginPacket = msgpack.pack(originPacket);

    // send the originPacket to the client, serialised with msgpack
    socket.send([client, rawOriginPacket]);
  };

  /**
   Generic packet sender for packet payloads which have the channel and message keys
   */
  this.sendChannelUpdateMessageToClientInPacketType = function(client, channel, message, type) {
    // create an origin packet
    var originPacket = {
      type: type,
      payload: {
        channel: channel,
        message: message,
      }
    };

    // send that origin packet to the client
    p.sendOriginPacketToClient(client, originPacket);
  };

  /**
   Gets the LCV from the cache and sends it to the client
   */
  this.sendLCVToClientForChannelAsPacketType = function(client, channel, type) {
    // get the LCV
    persistence.get(channel, function(value) {
      // send 
      p.sendChannelUpdateMessageToClientInPacketType(client, channel, value, type);
    });
  };

  /**
   Sends an update packet with the message to all subscribers on a channel
   */
  this.sendChannelUpdateMessageToSubscribersOnChannelInPacketType = function(channel, message, type) {
    // get all subscribers
    _.each(channels[channel], function(subscriber) {
      // send the message to them
      p.sendChannelUpdateMessageToClientInPacketType(client, channel, value, 'subscriptionAck');
    });
  };

  /**
   Processes an incoming originPacket from a client
   */
  this.processIncomingOriginPacketFromClient = function(client, rawOriginPacket) {
    // unpack the originPacket
    var originPacket = msgpack.unpack(rawOriginPacket);

    // some potential vars
    var channel;

    switch (originPacket.type) {
      case 'subscription': {
        channel = originPacket.payload.channel;

        // sub the client, idempotently
        p.subscribeClientOnChannel(client, channel);

        // send a LCV update
        p.sendLCVToClientForChannelAsPacketType(client, channel, 'subscriptionAck');

        // refresh the keepalive timeout
        p.refreshSubscriptionKeepaliveForClient(client);
      } break;

      case 'unsubscription': {
        channel = originPacket.payload.channel;

        // unsub from channel, idempotently
        p.unsubscribeClientFromChannel(client, channel);
      } break;

      case 'heartbeat': {
        // refresh the keepalive timeout
        p.refreshSubscriptionKeepaliveForClient(client);
      } break;
    }
  };
};
var p = new P();


/* Upstream data emitter API */

var API = function() {
  /**
   Stores the value and triggers an update to subscribers if the value has changed.
   */
  this.set = function(key, value) {
    // store the value
    persistence.set(key, value, function(hasValueChanged) {
      // if the value has changed
      if (hasValueChanged) {
        // send an update to subscribers
        p.sendChannelUpdateMessageToSubscribersOnChannelInPacketType(channel, value, 'subscriptionAck');
      }
    });
  };
};
var api = new API();

// start listening on the socket, and managing subscriptions and upsubscriptions
socket.on('message', function(envelope, data) {
  p.processIncomingOriginPacketFromClient(envelope, data);
});

// Start the service
var address = 'tcp://*:' + nconf.get('PORT');
socket.bindSync(address);
console.log('Origin server starter on address ' + address);
