/**
 * Ubuntu platform interface.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LinuxUbuntuCorePlatform } from './linux-ubuntu-core';
import LinuxRaspbianPlatform from './linux-raspbian';
import { SelfUpdateStatus } from './types';

class LinuxUbuntuPlatform extends LinuxUbuntuCorePlatform {
    /**
   * Determine whether or not the gateway can auto-update itself.
   *
   * @returns {Object} {available: <bool>, enabled: <bool>}
   */
    getSelfUpdateStatus(): SelfUpdateStatus {
      return {
        available: false,
        enabled: false,
      };
    }

    getDhcpServerStatus(): boolean {
      return LinuxRaspbianPlatform.getDhcpServerStatus();
    }
  
    getHostname(): string {
      return LinuxRaspbianPlatform.getHostname();
    }
  
    getMacAddress(device: string): string | null {
      return LinuxRaspbianPlatform.getMacAddress(device);
    }
  
    getMdnsServerStatus(): boolean {
      return LinuxRaspbianPlatform.getMdnsServerStatus();
    }
  
    getValidTimezones(): string[] {
      return LinuxRaspbianPlatform.getValidTimezones();
    }
  
    getTimezone(): string {
      return LinuxRaspbianPlatform.getTimezone();
    }
  
    getValidWirelessCountries(): string[] {
      return LinuxRaspbianPlatform.getValidWirelessCountries();
    }
  
    getNtpStatus(): boolean {
      return LinuxRaspbianPlatform.getNtpStatus();
    }
}

export default new LinuxUbuntuPlatform();