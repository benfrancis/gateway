/**
 *
 * ZWaveAdapter - Adapter which manages ZWave nodes
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

var Adapter = require('../../adapter.js').Adapter;
var ZWaveNode = require('./zwave-node.js');
var SerialPort = require('serialport');
var zwaveClassifier = require('./zwave-classifier');
var ZWaveModule = require('openzwave-shared');

const DEBUG = false;

class ZWaveAdapter extends Adapter {
  constructor(adapterManager, port) {
    // We don't know our id yet. So we set it to ??? and once we get the
    // driverReady notification, which will then set the id based on the homeId.
    super(adapterManager, '???');
    this.ready = false;
    this.named = false;

    this.port = port;
    this.nodes = {};
    this.nodesBeingAdded = {};

    this.zwave = new ZWaveModule({
      SaveConfiguration: true,
      ConsoleOutput: false,
      UserPath: '.',
    });
    this.zwave.on('controller command', this.controllerCommand.bind(this));
    this.zwave.on('driver ready', this.driverReady.bind(this));
    this.zwave.on('driver failed', this.driverFailed.bind(this));
    this.zwave.on('scan complete', this.scanComplete.bind(this));
    this.zwave.on('node added', this.nodeAdded.bind(this));
    this.zwave.on('node naming', this.nodeNaming.bind(this));
    this.zwave.on('node removed', this.nodeRemoved.bind(this));
    this.zwave.on('node event', this.nodeEvent.bind(this));
    this.zwave.on('node ready', this.nodeReady.bind(this));
    this.zwave.on('notification', this.nodeNotification.bind(this));
    this.zwave.on('value added', this.valueAdded.bind(this));
    this.zwave.on('value changed', this.valueChanged.bind(this));
    this.zwave.on('value removed', this.valueRemoved.bind(this));

    this.zwave.connect(port.comName);
  }

  asDict() {
    var dict = super.asDict();
    var node1 = this.nodes[1];
    if (node1) {
      this.node1 = node1.asDict();
    }
    return dict;
  }

  dump() {
    console.log('ZWave:', this.oneLineSummary());
    console.log('ZWave:', ZWaveNode.oneLineHeader(0));
    console.log('ZWave:', ZWaveNode.oneLineHeader(1));
    for (var nodeId in this.nodes) {
      let node = this.nodes[nodeId];
      console.log('ZWave:', node.oneLineSummary());
    }
    console.log('ZWave:', '----');
  }

  controllerCommand(nodeId, retVal, state, msg) {
    console.log('ZWave: Controller Command feedback: %s node%d retVal:%d ' +
                'state:%d', msg, nodeId, retVal, state);


  }

  driverReady(homeId) {
    console.log('ZWave: Driver Ready: HomeId:', homeId.toString(16));
    this.id = 'zwave-' + homeId.toString(16);

    this.manager.addAdapter(this);
  }

  driverFailed() {
    console.log('ZWave: failed to start driver');
    this.zwave.disconnect(this.port.comName);
  }

  handleDeviceAdded(node) {
    delete this.nodesBeingAdded[node.zwInfo.nodeId];

    if (node.nodeId > 1) {
      zwaveClassifier.classify(node);
      super.handleDeviceAdded(node);
    }
  }

  handleDeviceRemoved(node) {
    delete this.nodes[node.zwInfo.nodeId];
    delete this.nodesBeingAdded[node.zwInfo.nodeId];
    super.handleDeviceRemoved(node);
  }

  scanComplete() {
    // Add any nodes which otherwise aren't responding. This typically
    // corresponds to devices which are sleeping and only check in periodically.
    for (var nodeId in this.nodesBeingAdded) {
      this.handleDeviceAdded(this.nodesBeingAdded[nodeId]);
    }
    console.log('ZWave: Scan complete');
    this.ready = true;
    this.zwave.requestAllConfigParams(3);
    this.dump();
  }

  nodeAdded(nodeId) {
    if (DEBUG) {
      console.log('ZWave: node%d added', nodeId);
    }

    // Pass in the empty string as a name here. Once the node is initialized
    // (i.e. nodeReady) then if the user has assigned a name, we'll get
    // that name.
    let node = new ZWaveNode(this, nodeId, '');
    this.nodes[nodeId] = node;
    this.nodesBeingAdded[nodeId] = node;
    node.lastStatus = 'added';
  }

  nodeNaming(nodeId, nodeInfo) {
    var node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'named';
      var zwInfo = node.zwInfo;
      zwInfo.location = nodeInfo.loc;
      zwInfo.manufacturer = nodeInfo.manufacturer;
      zwInfo.manufacturerId = nodeInfo.manufacturerid;
      zwInfo.product = nodeInfo.product;
      zwInfo.productType = nodeInfo.producttype;
      zwInfo.productId = nodeInfo.productid;
      zwInfo.type = nodeInfo.type;

      if (zwInfo.product.startsWith('Unknown: ')) {
        zwInfo.product = zwInfo.manufacturer + ' ' + zwInfo.product;
      }

      if (nodeInfo.name) {
        // Use the assigned name, if it exists
        node.name = nodeInfo.name;
      } else if (node.defaultName) {
        // Otherwise use the constructed name
        node.name = node.defaultName;
      } else if (nodeId > 1) {
        // We don't have anything else, use the id
        node.name = node.id;
      }

      if (DEBUG || !node.named) {
        console.log('ZWave: node%d: Named',
                    nodeId,
                    zwInfo.manufacturer ? zwInfo.manufacturer :
                                          'id=' + zwInfo.manufacturerId,
                    zwInfo.product ? zwInfo.product :
                                   'product=' + zwInfo.productId +
                                   ', type=' + zwInfo.productType);
        console.log('ZWave: node%d: name="%s", type="%s", location="%s"',
                    zwInfo.nodeId, node.name, zwInfo.type, zwInfo.location);
      }
      node.named = true;

      if (DEBUG) {
        for (var comClass in node.classes) {
          var values = node.classes[comClass];
          console.log('ZWave: node%d: class %d', nodeId, comClass);
          for (var idx in values) {
            console.log('ZWave: node%d:   %s=%s',
                        nodeId, values[idx].label, values[idx].value);
          }
        }
      }
    }
  }

  nodeRemoved(nodeId) {
    if (DEBUG) {
      console.log('ZWave: node%d removed', nodeId);
    }

    var node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'removed';
      this.handleDeviceRemoved(node);
    }
  }

  nodeEvent(nodeId, data) {
    console.log('ZWave: node%d event: Basic set %d', nodeId, data);
  }

  nodeReady(nodeId, nodeInfo) {
    var node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'ready';
      node.ready = true;

      for (var comClass in node.classes) {
        switch (comClass) {
          case 0x25: // COMMAND_CLASS_SWITCH_BINARY
          case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
            this.zwave.enablePoll(nodeId, comClass);
            break;
        }
      }
      if (nodeId in this.nodesBeingAdded) {
        this.handleDeviceAdded(node);
      }
    }
  }

  nodeNotification(nodeId, notif, help) {
    var node = this.nodes[nodeId];
    var lastStatus;
    switch (notif) {
      case 0:
        console.log('ZWave: node%d: message complete', nodeId);
        lastStatus = 'msgCmplt';
        break;
      case 1:
        console.log('ZWave: node%d: timeout', nodeId);
        lastStatus = 'timeout';
        break;
      case 2:
        if (DEBUG) {
          console.log('ZWave: node%d: nop', nodeId);
        }
        lastStatus = 'nop';
        break;
      case 3:
        console.log('ZWave: node%d: node awake', nodeId);
        lastStatus = 'awake';
        break;
      case 4:
        console.log('ZWave: node%d: node sleep', nodeId);
        lastStatus = 'sleeping';
        break;
      case 5:
        console.log('ZWave: node%d: node dead', nodeId);
        lastStatus = 'dead';
        break;
      case 6:
        console.log('ZWave: node%d: node alive', nodeId);
        lastStatus = 'alive';
        break;
    }
    if (node && lastStatus) {
      node.lastStatus = lastStatus;
    }
  }

  oneLineSummary() {
    return 'Controller: ' + this.id + ' Path: ' + this.port.comName;
  }

  valueAdded(nodeId, comClass, value) {
    if (value.genre === 'user' || DEBUG) {
      console.log('ZWave: node%d valueAdded: %d:%s -> %s',
                  nodeId, comClass, value.label, value.value);
    }
    var node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'added';
      if (!node.classes[comClass]) {
        node.classes[comClass] = {};
      }
      node.classes[comClass][value.index] = value;
      node.values[value.value_id] = value;

      if (value.genre === 'user') {
        node.properties[value.value_id] = {
          'id': value.value_id,
          'name': value.label,
          'type': value.type,
          'value': value.value,
          'zwValue': value,
        };
        // We use the label from the first 'user' value that we see to help
        // disambiguate different nodes.
        if (!node.defaultName) {
          node.defaultName = this.id.toString(16) +
                             '-' + nodeId + '-' + value.label;
        }
      }
    }
  }

  valueChanged(nodeId, comClass, value) {
    var node = this.nodes[nodeId];
    if (node && node.ready) {
      console.log('ZWave: node%d valueChanged: %d:%s -> %s',
                  nodeId, comClass, value.label, value.value);
      node.classes[comClass][value.index] = value;
      if (node.properties[value.value_id]) {
        node.properties[value.value_id].value = value.value;
        node.properties[value.value_id].zwValue = value;
      }
    }
  }

  valueRemoved(nodeId, comClass, value_index) {
    console.log('ZWave: node%d valueRemoved: %d',
                nodeId, comClass);
    var node = this.nodes[nodeId];
    if (node) {
      if (node.classes[comClass] && node.classes[comClass][value_index]) {
        let valueId = node.classes[comClass][value_index].value_id;
        delete node.classes[comClass][value_index];
        delete node.values[valueId];
        delete node.properties[valueId];
      }
    }
  }

  startPairing() {
    console.log('ZWave: ===============================================')
    console.log('ZWave: Press the Inclusion button on the device to add');
    console.log('ZWave: ===============================================')
    this.zwave.addNode();
  }

  cancelPairing() {
    console.log('ZWave: Cancelling pairing mode');
    this.zwave.cancelControllerCommand();
  }

  startUnpairing() {
    console.log('ZWave: ==================================================')
    console.log('ZWave: Press the Exclusion button on the device to remove');
    console.log('ZWave: ==================================================')
    this.zwave.removeNode();
  }

  cancelUnpairing() {
    console.log('ZWave: Cancelling unpairing mode');
    this.zwave.cancelControllerCommand();
  }

  unload() {
    this.zwave.disconnect(this.port.comName);
    super.unload();
  }
}

function isZWavePort(port) {
  return ((port.vendorId == '0x0658' &&
           port.productId == '0x0200') ||  // Aeotech Z-Stick Gen-5
          (port.vendorId == '0x0658' &&
           port.productId == '0x0280') ||  // UZB1
          (port.vendorId == '0x10c4' &&
           port.productId == '0xea60'));   // Aeotech Z-Stick S2
}

// Scan the serial ports looking for an OpenZWave adapter.
//
//    callback(error, port)
//        Upon success, callback is invoked as callback(null, port) where `port`
//        is the port object from SerialPort.list().
//        Upon failure, callback is invoked as callback(err) instead.
//
function findZWavePort(callback) {
  SerialPort.list(function listPortsCallback (error, ports) {
    if (error) {
      callback(error);
    }
    for (var port of ports) {
      if (isZWavePort(port)) {
        callback(null, port);
        return;
      }
    }
    callback('No ZWave port found');
  });
}

function loadZWaveAdapters(adapterManager) {
  findZWavePort(function (error, port) {
    if (error) {
      console.error('Unable to find ZWave adapter');
      return;
    }

    console.log('Found ZWave port @', port.comName);

    /* jshint -W031 */
    new ZWaveAdapter(adapterManager, port);

    // The zwave adapter will be added when it's driverReady method is called.
    // Prior to that we don't know what the homeID of the adapter is.
  });
}

module.exports = loadZWaveAdapters;
