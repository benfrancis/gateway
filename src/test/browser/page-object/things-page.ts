import { Page, Section } from './elements';
import { ThingDetailPage } from './thing-detail-page';
import webdriverio from 'webdriverio';

class ThingSection extends Section {
  constructor(browser: webdriverio.BrowserObject, rootElement: webdriverio.Element) {
    super(browser, rootElement);
    this.defineElement('title', '.thing-title');
    this.defineElement('detailLink', '.thing-details-link');
    this.defineElement(
      'clickable',
      [
        'webthing-light-capability',
        'webthing-multi-level-switch-capability',
        'webthing-on-off-switch-capability',
        'webthing-smart-plug-capability',
      ].join(',')
    );
    this.defineElement(
      'level',
      [
        'webthing-light-capability',
        'webthing-multi-level-sensor-capability',
        'webthing-multi-level-switch-capability',
        'webthing-humidity-sensor-capability',
      ].join(',')
    );
    this.defineElement('power', 'webthing-smart-plug-capability');
  }

  async click(): Promise<void> {
    await this.waitClickable();
    const clickable = await this.clickable();
    await clickable.click();
  }

  async waitClickable(): Promise<void> {
    await this.browser.waitUntil(async () => {
      const menuScrim = await this.browser.$('#menu-scrim.hidden');
      if (!menuScrim || !menuScrim.isExisting()) {
        return false;
      }

      const width = await menuScrim.getCSSProperty('width');
      if (width && width.parsed && width.parsed.value === 0) {
        return true;
      }

      return false;
    }, 5000);
  }

  async thingTitle(): Promise<string> {
    const title = await this.title();
    return await title.getText();
  }

  async thingLevelDisplayed(): Promise<string> {
    const level = await this.level();
    return await level.getText();
  }

  async thingPowerDisplayed(): Promise<string> {
    const power = await this.power();
    return await power.getText();
  }

  async thingColorDisplayed(): Promise<string> {
    // Function represented as string since otherwise mangling breaks it
    const fill = `${await this.browser.execute(`
      const wlc = document.querySelector('webthing-light-capability');
      const icon =
        wlc.shadowRoot.querySelector('.webthing-light-capability-icon');
      return icon.style.fill;
    `)}`;

    const rgb = fill.match(/^rgb\((\d+), (\d+), (\d+)\)$/)!;
    const colorStyle = `#${Number(rgb[1]).toString(16)}${Number(rgb[2]).toString(16)}${Number(
      rgb[3]
    ).toString(16)}`;
    return colorStyle;
  }

  async openDetailPage(): Promise<ThingDetailPage | null> {
    await this.waitClickable();
    const hasLink = await this.hasDetailLink();
    if (!hasLink) {
      return null;
    }

    const el = this.rootElement!;
    const href = await el.getAttribute('href');

    const detailLink = await this.detailLink();
    await detailLink.click();

    return new ThingDetailPage(this.browser, href);
  }
}

export class ThingsPage extends Page {
  constructor(browser: webdriverio.BrowserObject) {
    super(browser, '/things');
    this.defineSections('things', '.thing', ThingSection);
    this.defineSections(
      'onThings',
      [
        'webthing-binary-sensor-capability',
        'webthing-light-capability',
        'webthing-multi-level-switch-capability',
        'webthing-on-off-switch-capability',
        'webthing-smart-plug-capability',
      ].join(','),
      ThingSection,
      true
    );
    this.defineSections(
      'offThings',
      [
        'webthing-binary-sensor-capability',
        'webthing-light-capability',
        'webthing-multi-level-switch-capability',
        'webthing-on-off-switch-capability',
        'webthing-smart-plug-capability',
      ].join(','),
      ThingSection,
      false
    );
  }

  async wait(): Promise<void> {
    await this.browser.waitUntil(async () => {
      const menuScrim = await this.browser.$('#menu-scrim.hidden');
      if (!menuScrim || !menuScrim.isExisting()) {
        return false;
      }

      const width = await menuScrim.getCSSProperty('width');
      if (width && width.parsed && width.parsed.value === 0) {
        return true;
      }

      return false;
    }, 5000);
  }
}