//
//  ZeroMQ.js
//  origin-service
//
//  Created by Luka Mirosevic on 05/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var nconf = require('nconf'),
    zmq = require('zmq'),
    msgpack = require('msgpack'),
    _ = require('underscore'),
    clc = require('cli-color'),
    toolbox = require('gb-toolbox');

var options = nconf.get('FRONTEND').options;

// some storage we will need to keep track of things
var storage = {
  channels: {},
  cleaners: {},
};

// ZeroMQ socket
var socket;

// main code
var P = function() {
  /**
   Stub implementation, must be override by client code
   */
  this.persistenceGetter = function(channel, callback) {
    console.log('Stub implementation, you must override this getter function using `setPeristenceKeyValueGetter`');
    toolbox.callCallback(callback, null);
  };

  /**
   Subscribe a client to a particular channel
   */
  this.subscribeClientOnChannel = function(client, channel) {
    // lazy create the channel
    if (_.isUndefined(storage.channels[channel])) {
      storage.channels[channel] = [];
    }

    // add the subscriber idempotently
    var subscribers = storage.channels[channel];
    toolbox.addToSet(subscribers, client);
  };  

  /**
   Unsubscribes a client from all channels
   */
  this.unsubscribeClientFromAllChannels = function(client) {
    _.each(storage.channels, function(subscribers, channel) {
      p.unsubscribeClientFromChannel(client, channel);
    });
  };

  /**
   Unsubscribes a client from a particular channel
   */
  this.unsubscribeClientFromChannel = function(client, channel) {
    if (storage.channels[channel]) {
      var subscribers = storage.channels[channel];
      toolbox.removeFromArray(subscribers, client);
    }
  };

  /**
   Refreshes the subscription timeout interval for a client
   */
  this.refreshSubscriptionKeepaliveForClient = function(client) {
    // check if there is already a cleanup function, and if not create it
    if (_.isUndefined(storage.cleaners[client])) {
      // this is the cleanup function
      storage.cleaners[client] = function() {
        // removes the subscriber from all the channels
        p.unsubscribeClientFromAllChannels(client);

        // cleanes up self
        delete storage.cleaners[client];
      };
    }

    // debounces the function so that it only ends up executing once the keepalives expire
    _.debounce(storage.cleaners[client], options.subscriptionKeepaliveTimeout * 1000);
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
    this.persistenceGetter(channel, function(value) {
      // send 
      p.sendChannelUpdateMessageToClientInPacketType(client, channel, value, type);
    });
  };

  /**
   Sends an update packet with the message to all subscribers on a channel
   */
  this.sendChannelUpdateMessageToSubscribersOnChannelInPacketType = function(channel, message, type) {
    // get all subscribers
    _.each(storage.channels[channel], function(subscriber) {
      // send the message to them
      p.sendChannelUpdateMessageToClientInPacketType(subscriber, channel, message, 'subscriptionAck');
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

        if (options.logSignificantUpdates) {
          p.cyanLog('Subscription');
          console.log(channel);
        }

        // sub the client, idempotently
        p.subscribeClientOnChannel(client, channel);

        // send a LCV update
        p.sendLCVToClientForChannelAsPacketType(client, channel, 'subscriptionAck');

        // refresh the keepalive timeout
        p.refreshSubscriptionKeepaliveForClient(client);
      } break;

      case 'unsubscription': {
        channel = originPacket.payload.channel;

        if (options.logSignificantUpdates) {
          p.cyanLog('Unsubscription');
          console.log(channel);
        }

        // unsub from channel, idempotently
        p.unsubscribeClientFromChannel(client, channel);
      } break;

      case 'heartbeat': {
        // refresh the keepalive timeout
        p.refreshSubscriptionKeepaliveForClient(client);
      } break;

      default: {
        console.log('Got garbage');
      } break;
    }
  };

  this.cyanLog = function(string) {
    console.log('>>> ' + clc.cyan(string));
  };
};
var p = new P();

var ZeroMQ = function() {
  /**
   Start a server and bind it on the specified port
   */
  this.startService = function() {
    // create our socket
    socket = zmq.socket('router');

    // start listening on the socket, and managing subscriptions and unsubscriptions
    socket.on('message', function(envelope, data) {
      p.processIncomingOriginPacketFromClient(envelope, data);
    });

    // prepare the address
    var port = options.port.toString();
    var address = 'tcp://*:' + port;
    
    // bind on the address
    socket.bindSync(address);
    console.log('Started ZeroMQ frontend service on port ' + port);
  };

  /**
   Sends an update to all subscribers for a particular channel
   */
  this.sendChannelUpdate = function(channel, value) {
    toolbox.requiredArguments(channel, value);

    p.sendChannelUpdateMessageToSubscribersOnChannelInPacketType(channel, value, 'subscriptionAck');
  };

  /**
   This should be a function supplied to the frontend, so the frontend can fetch channel updates autonomously. The getter function mus thave parameters: channel and callback, where callback should pass in the latest value of the channel
   */
   this.setPersistenceKeyValueGetter = function(getter) {
    p.persistenceGetter = getter;
   };
};
var zeroMQ = module.exports = new ZeroMQ();


//should bind on some port
//it keeps a mapping of channel -> subcriber
//it lazy creates and returns a delayed unsubscribe function and maps it to the subscriber (which when executed removes the subscriber from all channels, and removes itself from the list of cleaners) uses debounce for this
//when it receives something upstream, it sends an update to all clients for that particular channel and caches the LCV

