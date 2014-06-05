var zmq = require('zmq'); 

var socket = zmq.socket('router');

socket.on('message', function(envelope, data){
  console.log("received, replying immediately ==============");
  console.log(envelope);
  console.log(data);
  socket.send([envelope, data]);
});

// Start listening on the socket
var port = 56301;
socket.bindSync('tcp://*:' + port);
console.log('Started debug server, listening on port ' + port);
