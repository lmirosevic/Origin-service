//
//  config.js
//  origin-service
//
//  Created by Luka Mirosevic on 12/06/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var nconf = require('nconf'),
    path = require('path');

module.exports = nconf.argv()
                 .env('__')
                 .file('application', {file: path.join(__dirname, '../config/settings.json')})
                 .file('shared', {file: path.join(__dirname, '../../../shared/config/settings.json')})
                 .file('defaults', {file: path.join(__dirname, '../config/defaults.json')});
