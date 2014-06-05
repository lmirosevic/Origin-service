var nconf = require('nconf'),
    zmq = require('zmq'),
    _ = require('underscore');


var socket = zmq.socket('dealer');

socket.connect('tcp://localhost:56301');

socket.send('hello');

socket.on('message', function(data) {
  console.log(data);
});
