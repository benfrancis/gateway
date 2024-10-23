/**
 * Ubuntu Core platform interface.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import BasePlatform from './base';
import NetworkManager from './utilities/network-manager';
import ipRegex from 'ip-regex';
import {LanMode, NetworkAddresses, WirelessNetwork} from './types';
let Netmask = require('netmask').Netmask;

export class LinuxUbuntuCorePlatform extends BasePlatform {

  /**
   * Get the current addresses for Wi-Fi and LAN.
   *
   * @returns {Promise<NetworkAddresses>} Promise that resolves with
   *   {
   *     lan: '...',
   *     wlan: {
   *      ip: '...',
   *      ssid: '...',
   *    }
   *  }
   */
  async getNetworkAddressesAsync(): Promise<NetworkAddresses> {
    let result: NetworkAddresses = {
      lan: '',
      wlan: {
        ip: '',
        ssid: ''
      }
    };
    try {
      const ethernetDevices = await NetworkManager.getEthernetDevices();
      const ethernetIp4Config = await NetworkManager.getDeviceIp4Config(ethernetDevices[0]);
      result.lan = ethernetIp4Config[0].address;
    } catch(error) {
        console.log('Unable to detect an Ethernet IP address');
    }
    try {
      const wifiDevices = await NetworkManager.getWifiDevices();
      const wifiIp4Config = await NetworkManager.getDeviceIp4Config(wifiDevices[0]);
      const accessPoint = await NetworkManager.getActiveAccessPoint(wifiDevices[0]);
      const ssid = await NetworkManager.getAccessPointSsid(accessPoint);
      result.wlan.ip = wifiIp4Config[0].address;
      result.wlan.ssid = ssid;
    } catch(error) {
      console.log('Unable to detect a Wi-Fi IP address and active SSID');
    }
    return result;
  }

  /**
   * Get LAN network settings.
   *
   * @returns {Promise<LanMode>} Promise that resolves with 
   *   {mode: 'static|dhcp|...', options: {...}}
   */
  async getLanModeAsync(): Promise<LanMode> {
    let result: LanMode = {
      mode: '',
      options: {}
    };
    return NetworkManager.getEthernetDevices().then((devices) => {
      return NetworkManager.getDeviceConnection(devices[0]);
    }).then((connection) => {
      return NetworkManager.getConnectionSettings(connection);
    }).then((settings: any) => {
      if(settings.ipv4.method == 'auto') {
        result.mode = 'dhcp';
      } else if(settings.ipv4.method == 'manual') {
        result.mode = 'static';
      }
      if(settings.ipv4['address-data'][0] && 
        settings.ipv4['address-data'][0].hasOwnProperty('address')) {
        result.options.ipaddr = settings.ipv4['address-data'][0].address;
      }
      if(settings.ipv4.hasOwnProperty('gateway')) {
        result.options.gateway = settings.ipv4.gateway;
      }
      if(result.options.ipaddr && 
        settings.ipv4['address-data'][0].hasOwnProperty('prefix')) {
        // Convert cidr style prefix to dot-decimal netmask
        const ip = result.options.ipaddr;
        const cidr = settings.ipv4['address-data'][0].prefix;
        const block = new Netmask(`${ip}/${cidr}`);
        result.options.netmask = block.mask;
      }
      return result;
    }).catch((error) => {
      console.error('Error getting LAN mode from Network Manager: ' + error);
      return result;
    });
  }

  /**
   * Set LAN network settings.
   *
   * @param {string} mode static|dhcp|....
   * @param {<Record<string, any>} options Mode-specific options.
   * @returns {Promise<boolean>} Promise that resolves true if successful and false if not.
   */
  async setLanModeAsync(mode: string, options: Record<string, any>): Promise<boolean> {
    let lanDevice: string;
    let lanConnection: string;
    return NetworkManager.getEthernetDevices().then((devices) => {
      lanDevice = devices[0];
      return NetworkManager.getDeviceConnection(lanDevice);
    }).then((connection) => {
      lanConnection = connection;
      // First get current settings to carry over some values
      return NetworkManager.getConnectionSettings(lanConnection);
    }).then((oldSettings) => {
      let settings: Record<string, any> = {};
      // Carry over some values from the old settings
      settings.connection = {
        id: oldSettings.connection.id,
        uuid: oldSettings.connection.uuid,
        type: oldSettings.connection.type
      }
      if(mode == 'dhcp') {
        // Set dynamic IP
        settings.ipv4 = {
          method: 'auto'
        };
      } else if(mode == 'static') {
        const regex = ipRegex({ exact: true });
        if (
          !(options.hasOwnProperty('ipaddr') && regex.test(<string>options.ipaddr) &&
          options.hasOwnProperty('gateway') && regex.test(<string>options.gateway) &&
          options.hasOwnProperty('netmask') && regex.test(<string>options.netmask))) {
          console.log('Setting a static IP address requires a valid IP address, gateway and netmask');
          return false;
        }
        // Set static IP address
        // Convert dot-decimal netmask to cidr style prefix for storage
        const netmask = new Netmask(options.ipaddr, options.netmask);
        const prefix = netmask.bitmask;
        // Convert dot-decimal IP and gateway to little endian integers for storage
        const ipaddrInt = options.ipaddr.split('.').reverse().reduce(function(int: any, value: any) { return int * 256 + +value });
        const gatewayInt = options.gateway.split('.').reverse().reduce(function(int: any, value: any) { return int * 256 + +value });
        settings.ipv4 = {
          'method': 'manual',
          'addresses': [
            [ipaddrInt, prefix, gatewayInt]
          ],
          // The NetworkManager docs say that the addresses property is deprecated,
          // but using address-data and gateway doesn't seem to work on Ubuntu yet.
          /*'address-data': [{
            'address': options.ipaddr,
            'prefix': prefix
          }],
          'gateway': options.gateway*/
        }
      } else {
        console.error('LAN mode not recognised');
        return false;
      }
      return NetworkManager.setConnectionSettings(lanConnection, settings);
    }).then(() => {
      return NetworkManager.activateConnection(lanConnection, lanDevice);
    }).catch((error) => {
      console.error('Error setting LAN settings: ' + error);
      return false;
    });
  }

  /**
   * Scan for visible wireless networks on the first wireless device.
   *
   * @returns {Promise<WirelessNetwork[]>} Promise which resolves with an array of networks as objects:
   *  [
   *    {
   *      ssid: '...',
   *      quality: <number>,
   *      encryption: true|false,
   *      configured: true|false,
   *      connected: true|false
   *    },
   *    ...                 
   *  ]
   */
  async scanWirelessNetworksAsync(): Promise<WirelessNetwork[]> {
    const wifiDevices = await NetworkManager.getWifiDevices();
    const wifiAccessPoints = await NetworkManager.getWifiAccessPoints(wifiDevices[0]);
    let activeAccessPoint: string|null;
    try {
      activeAccessPoint = await NetworkManager.getActiveAccessPoint(wifiDevices[0]);
    } catch(error) {
      activeAccessPoint = null;
    }
    let apRequests: Array<Promise<WirelessNetwork>> = [];
    wifiAccessPoints.forEach((ap) => {
      apRequests.push(NetworkManager.getAccessPointDetails(ap, activeAccessPoint));
    });
    let responses = await Promise.all(apRequests);
    return responses;
  }

  /**
   * Set the wireless mode and options.
   *
   * @param {boolean} enabled - whether or not wireless is enabled
   * @param {string} mode - ap, sta, ...
   * @param {Object?} options - options specific to wireless mode
   * @returns {Promise<boolean>} Boolean indicating success.
   */
  async setWirelessModeAsync(enabled: boolean, mode = 'ap', options: Record<string, any> = {}): Promise<boolean> {
    const valid = [
      //'ap', //TODO: Implement ap mode
      'sta'
    ];
    if (enabled && !valid.includes(mode)) {
      console.error(`Wireless mode ${mode} not supported on this platform`);
      return false;
    }
    const wifiDevices = await NetworkManager.getWifiDevices();

    // If `enabled` set to false, disconnect wireless device
    if(enabled === false) {
      // Return false if no wifi device found
      if(!wifiDevices[0]) {
        return false;
      }
      try {
        await NetworkManager.disconnectNetworkDevice(wifiDevices[0]);
      } catch(error) {
        console.error(`Error whilst attempting to disconnect wireless device: ${error}`);
        return false;
      }
      return true;
    }

    // Otherwise connect to Wi-Fi access point using provided options
    if(!options.hasOwnProperty('ssid')) {
      console.log('Could not connect to wireless network because no SSID provided');
      return false;
    }
    const accessPoint = await NetworkManager.getAccessPointbySsid(options.ssid);
    if(accessPoint == null) {
      console.log('No network with specified SSID found');
      return false;
    }
    let secure = false;
    if (options.key) {
      secure = true;
    }
    try {
      NetworkManager.connectToWifiAccessPoint(wifiDevices[0], accessPoint, options.ssid, 
        secure, options.key)
    } catch(error) {
      console.error(`Error connecting to Wi-Fi access point: ${error}`);
      return false;
    }
    return true;
  }
}

export default new LinuxUbuntuCorePlatform();
