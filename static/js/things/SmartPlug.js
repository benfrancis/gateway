/**
 * Smart Plug.
 *
 * UI element representing a Smart Plug.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

/* globals Thing, OnOffSwitch, OnOffDetail, ThingDetailLayout */

/**
 * Smart Plug Constructor.
 *
 * @extends OnOffSwitch
 * @param Object description Thing description object.
 * @param {String} format 'svg' or 'html'.
 */
var SmartPlug = function(description, format) {
  if (format === 'htmlDetail') {
    this.details = {
      on: new OnOffDetail(this)
    };
  }

  this.base = Thing;
  this.base(description, format);
  if (format == 'svg') {
    // For now the SVG view is just a link.
    return this;
  }
  // Parse on property URL
  if (this.propertyDescriptions.on.href) {
    this.onPropertyUrl = new URL(this.propertyDescriptions.on.href, this.href);
  }
  // Parse instantaneousPower property URL
  if (this.propertyDescriptions.on.href) {
    this.powerPropertyUrl = new URL(
      this.propertyDescriptions.instantaneousPower.href, this.href);
  }
  this.powerLabel = this.element.querySelector('.smart-plug-power');
  this.updateStatus();
  if (format === 'htmlDetail') {
    this.details.on.attach();
    this.layout = new ThingDetailLayout(
      this.element.querySelectorAll('.thing-detail-container'));
  }
  return this;
};

SmartPlug.prototype = Object.create(OnOffSwitch.prototype);

SmartPlug.prototype.iconView = function() {
  return `<div class="thing-icon">
    <span class="smart-plug-power">0W</span>
    </div>`;
};

/**
 * HTML view for on/off switch.
 */
SmartPlug.prototype.htmlView = function() {
  return `<a href="${this.href}">
    <div class="thing smart-plug">
      ${this.iconView()}
      <span class="thing-name">${this.name}</span>
    </div>
  </a>`;
};

/**
 * HTML detail view for Color bulb
 */
SmartPlug.prototype.htmlDetailView = function() {
  return `<div class="smart-plug-container">
    <div class="thing">
      ${this.iconView()}
    </div>
    <div class="thing-detail-container">
    </div>
    ${this.details.on.view()}
  </div>`;
};

/**
 * SVG view for on/off switch.
 */
SmartPlug.prototype.svgView = function() {
  return '<g transform="translate(' + this.x + ',' + this.y + ')"' +
         '  dragx="' + this.x + '" dragy="' + this.y + '"' +
         '  class="floorplan-thing">' +
         '  <a href="' + this.href +'" class="svg-thing-link">' +
         '    <circle cx="0" cy="0" r="5" class="svg-thing-icon" />' +
         '    <image x="-2.5" y="-2.5" width="5" height="5" ' +
         '      xlink:href="/images/smart-plug-off.svg" />' +
         '    <text x="0" y="8" text-anchor="middle" class="svg-thing-text">' +
                this.name.substring(0, 7) +
         '    </text>' +
         '  </a>' +
         '</g>';
};

/**
 * Update the on/off status of the smart plug.
 */
SmartPlug.prototype.updateStatus = function() {
  console.log('updating status');
  var opts = {
    headers: {
      'Authorization': `Bearer ${window.API.jwt}`,
      'Accept': 'application/json'
    }
  };

  if (this.onPropertyUrl) {
    fetch(this.onPropertyUrl, opts).then(function(response) {
      return response.json();
    }).then((function(response) {
      this.onPropertyStatus(response);
    }).bind(this)).catch(function(error) {
      console.error('Error fetching on/off switch status ' + error);
    });
  }

  if (this.powerPropertyUrl) {
    console.log('updating power status');
    fetch(this.powerPropertyUrl, opts).then(function(response) {
      return response.json();
    }).then((function(response) {
      this.onPropertyStatus(response);
    }).bind(this)).catch(function(error) {
      console.error('Error fetching instantaneous power ' + error);
    });
  }

};

/**
 * Handle a 'propertyStatus' message
 * @param {Object} properties - property data
 */
SmartPlug.prototype.onPropertyStatus = function(data) {
  // Update on/off state
  if (data.hasOwnProperty('on')) {
    this.properties.on = data.on;
    if (data.on) {
      this.showOn();
    } else {
      this.showOff();
    }
  }

  // Update power meter
  if (data.hasOwnProperty('instantaneousPower')) {
    this.properties.power = data.instantaneousPower;
    if (this.properties.on && this.properties.power) {
      this.showPower(data.instantaneousPower);
    }
  }

};

/**
 * Show on state.
 */
SmartPlug.prototype.showOn = function() {
  this.element.classList.remove('off');
  this.element.classList.add('on');
  this.showPower(this.properties.power);
};

/**
 * Show off state.
 */
SmartPlug.prototype.showOff = function() {
  this.element.classList.remove('on');
  this.element.classList.add('off');
  this.powerLabel.innerText = 'OFF';
};

/**
 * Show transition state.
 */
SmartPlug.prototype.showTransition = function() {
  this.element.classList.remove('on');
  this.element.classList.remove('off');
};

/**
 * Show instantaneous power consumption.
 */
SmartPlug.prototype.showPower = function(power) {
  console.log('Power ' + power);
  if (this.properties.power) {
    this.powerLabel.innerText = power + 'W';
  } else {
    this.powerLabel.innerText = '0W';
  }
};

/**
 * Send a request to turn on and update state.
 *
 */
SmartPlug.prototype.turnOn = function() {
  this.showTransition();
  this.properties.on = null;
  var payload = {
   'on': true
  };
  fetch(this.onPropertyUrl, {
   method: 'PUT',
   body: JSON.stringify(payload),
   headers: {
     'Authorization': `Bearer ${window.API.jwt}`,
     'Accept': 'application/json',
     'Content-Type': 'application/json'
   }
  })
  .then((function(response) {
   if (response.status == 200) {
     this.showOn();
     this.properties.on = true;
   } else {
     console.error('Status ' + response.status + ' trying to turn on plug');
   }
  }).bind(this))
  .catch(function(error) {
   console.error('Error trying to turn on plug: ' + error);
  });
};

/**
 * Send a request to turn off and update state.
 */
SmartPlug.prototype.turnOff = function() {
  this.showTransition();
  this.properties.on = null;
  var payload = {
    'on': false
  };
  fetch(this.onPropertyUrl, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: {
      'Authorization': `Bearer ${window.API.jwt}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })
  .then((function(response) {
    if (response.status == 200) {
      this.showOff();
      this.properties.on = false;
    } else {
      console.error('Status ' + response.status + ' trying to turn off switch');
    }
  }).bind(this))
  .catch(function(error) {
    console.error('Error trying to turn off switch: ' + error);
  });
};
