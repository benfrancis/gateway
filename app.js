#!/usr/bin/env node
/*
 * MozIoT Gateway App.
 *
 * Back end main script.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* jshint unused:false */

'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var express = require('express');
var expressWs = require('express-ws');
var bodyParser = require('body-parser');
var GetOpt = require('node-getopt');
var adapterManager = require('./adapter-manager');
var db = require('./db');

var port = 8080;
var https_port = 4443;
var options = {
  key: fs.readFileSync('privatekey.pem'),
  cert: fs.readFileSync('certificate.pem')
};

var app = express();
var server = https.createServer(options, app);
var expressWs = expressWs(app, server);

// Command line arguments
var getopt = new GetOpt([
  ['d', 'debug',      'Enable debug features'],
  ['p', 'port=PORT',  'Specify the server port to use (default ' + port + ')'],
  ['h', 'help',       'Display help' ],
  ['v', 'verbose',    'Show verbose output' ],
]);

var opt = getopt.parseSystem();
if (opt.options.verbose) {
    console.log(opt);
}

if (opt.options.help) {
    getopt.showHelp();
    process.exit(1);
}

if (opt.options.port) {
  port = parseInt(opt.options.port);
}

// We need to install a bodyParser in order to access the body in
// PUT & POST requests
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Open the thing database.
db.open();

// Serve Things from Things router
var thingsRouter = require('./controllers/things_controller');
app.use('/things', thingsRouter);

// Serve New Things from New Things router
var newThingsRouter = require('./controllers/new_things_controller');
app.use('/new_things', newThingsRouter);

// Serve Adapters from Adapters router.
var adaptersRouter = require('./controllers/adapters_controller');
app.use('/adapters', adaptersRouter);

// Gateway actions router.
var actionsRouter = require('./controllers/actions_controller');
app.use('/actions', actionsRouter);

if (opt.options.debug) {
  // Serve Debug stuff from /debug
  var debugRouter = require('./controllers/debug_controller');
  app.use('/debug', debugRouter);
}

// Serve static files from static/ directory
app.use(express.static('static'));

// Get some decent error messages for unhandled rejections. This is
// often just errors in the code.
process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection');
  console.error(reason);
});

// Do graceful shutdown when Control-C is pressed.
process.on('SIGINT', function() {
  console.log('Control-C: disconnecting adapters...');
  adapterManager.unloadAdapters();
  process.exit(1);
});

server.listen(https_port, function() {
  console.log('Listening on port', https_port);
  adapterManager.loadAdapters();
});
