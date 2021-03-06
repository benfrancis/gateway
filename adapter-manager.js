/**
 * Manages all of the Adapters used in the system.
 *
 * @module AdapterManager
 */
/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var Deferred = require('./deferred');

/**
 * @class AdapterManager
 * @classdesc The AdapterManager will load any adapters from the 'adapters'
 * directory. See loadAdapters() for details.
 */
class AdapterManager extends EventEmitter {

  constructor() {
    super();
    this.adapters = {};
    this.devices = {};
    this.deferredAdd = null;
    this.deferredRemove = null;
  }

  /**
   * Adds an adapter to the collection of adapters managed by AdapterManager.
   * This function is typically called when loading adapters.
   */
  addAdapter(adapter) {
    adapter.name = adapter.constructor.name;
    this.adapters[adapter.id] = adapter;

    /**
     * Adapter added event.
     *
     * This is event is emitted whenever a new adapter is loaded.
     *
     * @event adapter-added
     * @type  {Adapter}
     */
    this.emit('adapter-added', adapter);
  }

  /**
   * @method addNewThing
   * Initiates pairing on all of the adapters that support it.
   * The user then presses the "button" on the device to be added.
   * @returns A promise that resolves to the newly added device.
   */
  addNewThing() {
    var deferredAdd = new Deferred();

    if (this.deferredAdd) {
      deferredAdd.reject('Add already in progress');
    } else if (this.deferredRemove) {
      deferredAdd.reject('Remove already in progress');
    } else {
      this.deferredAdd = deferredAdd;
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        console.log('About to call startPairing on', adapter.name);
        adapter.startPairing();
      }
    }

    return deferredAdd.promise;
  }

  /**
   * @method cancelAddNewThing
   *
   * Cancels a previous addNewThing request.
   */
  cancelAddNewThing() {
    var deferredAdd = this.deferredAdd;

    if (deferredAdd) {
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        adapter.cancelPairing();
      }
      this.deferredAdd = null;
      deferredAdd.reject('addNewThing cancelled');
    }
  }

  /**
   * @method cancelAddSomeThing
   *
   * Cancels a previous removeSomeThing request.
   */
  cancelRemoveSomeThing() {
    var deferredRemove = this.deferredRemove;
    if (deferredRemove) {
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        adapter.cancelUnpairing();
      }
      this.deferredRemove = null;
      deferredRemove.reject('removeSomeThing cancelled');
    }
  }

  /**
   * @method getAdapter
   * @returns Returns the adapter with the indicated id.
   */
  getAdapter(id) {
    return this.adapters[id];
  }

  /**
   * @method getAdapters
   * @returns Returns a dictionary of the loaded adapters. The dictionary
   *          key corresponds to the adapter id.
   */
  getAdapters() {
    return this.adapters;
  }

  /**
   * @method getDevice
   * @returns Returns the device with the indicated id.
   */
  getDevice(id) {
    return this.devices[id];
  }

  /**
   * @method getDevices
   * @returns Returns an dictionary of all of the known devices.
   *          The dictionary key corresponds to the device id.
   */
  getDevices() {
    return this.devices;
  }

  /**
   * @method getThings
   * @returns Returns an dictionary of all of the known things.
   *          The dictionary key corresponds to the device id.
   */
  getThings() {
    var things = [];
    for (var thingId in this.devices) {
      things.push(this.getThing(thingId));
    }
    return things;
  }

  /**
   * @method getThing
   * @returns Returns the thing with the indicated id.
   */
  getThing(thingId) {
    var device = this.getDevice(thingId);
    if (device) {
      return device.getThing();
    }
  }

  /**
   * @method getPropertyDescriptions
   * @returns Retrieves all of the properties associated with the thing
   *          identified by `thingId`.
   */
  getPropertyDescriptions(thingId) {
    var device = this.getDevice(thingId);
    if (device) {
      return device.getPropertyDescriptions();
    }
  }

  /**
   * @method getPropertyDescription
   * @returns Retrieves the property named `propertyName` from the thing
   *          identified by `thingId`.
   */
  getPropertyDescription(thingId, propertyName) {
    var device = this.getDevice(thingId);
    if (device) {
      return device.getPropertyDescription(propertyName);
    }
  }

  /**
   * @method getProperty
   * @returns Retrieves the value of the property named `propertyName` from
   *          the thing identified by `thingId`.
   */
  getProperty(thingId, propertyName) {
    var device = this.getDevice(thingId);
    if (device) {
      return device.getProperty(propertyName);
    }
  }

  /**
   * @method setProperty
   * @returns Sets the value of the property named `propertyName` for
   *          the thing identified by `thingId`.
   */
  setProperty(thingId, propertyName, value) {
    var device = this.getDevice(thingId);
    if (device) {
      device.setProperty(propertyName, value);
    }
  }

  /**
   * @method handleDeviceAdded
   *
   * Called when the indicated device has been added to an adapter.
   */
  handleDeviceAdded(device) {
    this.devices[device.id] = device;
    var thing = device.getThing();

    /**
     * Thing added event.
     *
     * This event is emitted whenever a new thing is added.
     *
     * @event thing-added
     * @type  {Thing}
     */
    this.emit('thing-added', thing);

    // If this device was added in response to addNewThing, then
    // We need to cancel pairing mode on all of the "other" adapters.

    var deferredAdd = this.deferredAdd;
    if (deferredAdd) {
      this.deferredAdd = null;
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        if (adapter !== device.adapter) {
          adapter.cancelPairing();
        }
      }
      console.log('AdapterManager: About to resolve deferredAdd');
      deferredAdd.resolve(thing);
    }
  }

  /**
   * @method handleDeviceRemoved
   * Called when the indicated device has been removed an adapter.
   */
  handleDeviceRemoved(device) {
    delete this.devices[device.id];
    var thing = device.getThing();

    /**
     * Thing removed event.
     *
     * This event is emitted whenever a new thing is removed.
     *
     * @event thing-added
     * @type  {Thing}
     */
    this.emit('thing-removed', thing);

    // If this device was removed in response to removeSomeThing, then
    // We need to cancel unpairing mode on all of the "other" adapters.

    console.log('AdapterManager: handleDeviceRemoved');
    var deferredRemove = this.deferredRemove;
    if (deferredRemove) {
      this.deferredRemove = null;
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        if (adapter !== device.adapter) {
          adapter.cancelUnpairing();
        }
      }
      console.log('AdapterManager: About to resolve deferredRemove');
      deferredRemove.resolve(thing);
    }
  }

  /**
   * @method loadAdapters
   * Loads all of the adapters from the adapters directory.
   */
  loadAdapters() {
    var adapterDir = './adapters';
    var adapterManager = this;
    fs.readdir(adapterDir, function fileList(err, filenames) {
      if (err) {
        console.error(err);
        return;
      }
      for (var filename of filenames) {
        let adapterFilename = adapterDir + '/' + filename;
        if (!fs.lstatSync(adapterFilename).isDirectory() &&
          path.extname(filename) !== '.js') {
          continue;
        }
        console.log('Loading Adapters from', adapterFilename);

        let adapterLoader = require(adapterFilename);
        adapterLoader(adapterManager);
      }
    });
  }

  /**
   * @method removeSomeThing
   * Initiates unpairing on all of the adapters that support it.
   * The user then presses the "button" on the device to be removed.
   * @returns A promise that resolves to the removed device.
   */
  removeSomeThing() {
    var deferredRemove = new Deferred();

    if (this.deferredAdd) {
      deferredRemove.reject('Add already in progress');
    } else if (this.deferredRemove) {
      deferredRemove.reject('Remove already in progress');
    } else {
      this.deferredRemove = deferredRemove;
      for (var adapterId in this.adapters) {
        var adapter = this.adapters[adapterId];
        adapter.startUnpairing();
      }
    }

    return deferredRemove.promise;
  }

  /**
   * @method unloadAdapters
   * Unloads all of the loaded adapters.
   */
  unloadAdapters() {
    for (var adapterId in this.adapters) {
      var adapter = this.adapters[adapterId];
      console.log('Unloading', adapter.name);
      adapter.unload();
    }
  }
}

module.exports = new AdapterManager();
