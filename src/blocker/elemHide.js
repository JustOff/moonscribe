/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * @fileOverview Element hiding implementation.
 */

const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
var logger = new (require('./../misc/logger.js'))(['dom']);

let {Utils} = require("./util.js");
let {IO} = require("./io.js");
let settings = require('./../settings.js');
let {ElemHideException} = require('./filterClasses.js');
const {TextEncoder} = Cu.import("resource://gre/modules/osfile.jsm", {});

var registry = require('./../registry.js');

let { debounce } = require("sdk/lang/functional");
var debounceLogger = debounce(function (str) {
  logger.log(str);
}, 1000);


/**
 * Lookup table, filters by their associated key
 * @type Object
 */
let filterByKey = Object.create(null);

/**
 * Lookup table, keys of the filters by filter text
 * @type Object
 */
let keyByFilter = Object.create(null);

/**
 * Lookup table, keys are known element hiding exceptions
 * @type Object
 */
let knownExceptions = Object.create(null);

/**
 * Lookup table, lists of element hiding exceptions by selector
 * @type Object
 */
let exceptions = Object.create(null);

/**
 * Currently applied stylesheet URL
 * @type nsIURI
 */
let styleURL = null;

//noinspection AssignmentResultUsedJS
/**
 * Element hiding component
 * @class
 */
let ElemHide =
{
  /**
   * Indicates whether filters have been added or removed since the last apply() call.
   * @type Boolean
   */
  isDirty: false,

  /**
   * Inidicates whether the element hiding stylesheet is currently applied.
   * @type Boolean
   */
  applied: false,

  /**
   * Called on module startup.
   */
  init: function()
  {

    let styleFile = IO.resolveFilePath(settings.data_directory, Ci.nsIFile.DIRECTORY_TYPE);

    styleFile.append("elemhide.css");
    IO.resolveFilePath(styleFile.path, Ci.nsIFile.NORMAL_FILE_TYPE);


    styleURL = Services.io.newFileURI(styleFile).QueryInterface(Ci.nsIFileURL);
    logger.log('styleURL:     file://'+styleURL.path);

    registry.onEvent('shutdown', function(){
      ElemHide.unapply();
    });
  },

  /**
   * Removes all known filters
   */
  clear: function()
  {
    let me = this;
    filterByKey = Object.create(null);
    keyByFilter = Object.create(null);
    knownExceptions = Object.create(null);
    exceptions = Object.create(null);
    logger.log('isDirty set to false');
    // logger.log(new Error().stack);
    me.isDirty = false;
    me.unapply();
  },

  /**
   * Add a new element hiding filter
   * @param {ElemHideFilter} filter
   */
  add: function(filter)
  {
    let me = this;
    if (filter instanceof ElemHideException)
    {
      if (filter.text in knownExceptions)
        return;

      let selector = filter.selector;
      if (!(selector in exceptions))
        exceptions[selector] = [];
      exceptions[selector].push(filter);
      knownExceptions[filter.text] = true;
    }
    else
    {
      if (filter.text in keyByFilter)
        return;

      let key;
      do {
        key = Math.random().toFixed(15).substr(5);
      } while (key in filterByKey);

      filterByKey[key] = filter;
      keyByFilter[filter.text] = key;
      me.isDirty = true;
    }
  },

  /**
   * Removes an element hiding filter
   * @param {ElemHideFilter} filter
   */
  remove: function(filter)
  {
    let me = this;
    if (filter instanceof ElemHideException)
    {
      if (!(filter.text in knownExceptions))
        return;

      let list = exceptions[filter.selector];
      let index = list.indexOf(filter);
      if (index >= 0)
        list.splice(index, 1);
      delete knownExceptions[filter.text];
    }
    else
    {
      if (!(filter.text in keyByFilter))
        return;

      let key = keyByFilter[filter.text];
      delete filterByKey[key];
      delete keyByFilter[filter.text];
      logger.log('set isDirty true on remove');
      me.isDirty = true;
    }
  },

  /**
   * Will be set to true if apply() is running (reentrance protection).
   * @type Boolean
   */
  _applying: false,

  /**
   * Will be set to true if an apply() call arrives while apply() is already
   * running (delayed execution).
   * @type Boolean
   */
  _needsApply: false,

  /**
   * Generates stylesheet URL and applies it globally
   */
  apply: function() {
    try{
      if(registry.has('apply_css')){
        if(registry.resolve('apply_css') === true){
          logger.log('apply_css is true, we are RUNNING IT ALREADY');
        } else {
          logger.log('apply_css is false, all fine');
        }
      } else {
        logger.log('apply_css is not set yet, first run probably');
      }

      registry.register('apply_css', true);

      var me = this;
      return new Promise(function (resolve, reject) {
        logger.log('start applying');
        if (me._applying) {

          me._needsApply = true; // will call in final callback

          logger.log('need applying but already running, will run later again, in  current implementation this is _impossible_ situation due to ordering requests for writtings');
          registry.register('apply_css', false);
          return resolve();
        }
        logger.log('me.isDirty:'+me.isDirty);
        if(!me.isDirty){
          registry.register('apply_css', false);
          return resolve(); // we are state machine
        }

        logger.log('start write fite actually');
        IO.writeToFile(styleURL.file, me._generateCSSContent(), function(e) {
          logger.log('end of file writing:'+e);
          me._applying = false;

          if(me._stopped){
            me._stopped = false;
            return resolve();
          }

          // _generateCSSContent is throwing NS_ERROR_NOT_AVAILABLE to indicate that
          // there are no filters. If that exception is passed through XPCOM we will
          // see a proper exception here, otherwise a number.
          let noFilters = (e == Cr.NS_ERROR_NOT_AVAILABLE || (e && e.result == Cr.NS_ERROR_NOT_AVAILABLE));
          if (noFilters) {
            logger.log('_generateCSSContent is throwing NS_ERROR_NOT_AVAILABLE to indicate that, there are no filters, and unlink the file');
            e = null;
            ElemHide.unapply();
            IO.removeFile(styleURL.file, function(e) {
              registry.register('apply_css', false);
              resolve();
            });
            return;
          } else if (e){
            Cu.reportError(e);
            logger.error('exception during file writting', e);
            return reject(e);
          }

          if (me._needsApply) {
            logger.log('_needsApply, run  apply, _impossible_ situation due to current implementation');
            me._needsApply = false;
            me.apply().then(function () {
              registry.register('apply_css', false);
              resolve();
            });
            return;
          } else if (!e) {
            logger.log('no error, actually manual re-apply after file writing, isDirty set to false');
            me.isDirty = false;

            ElemHide.unapply();

            // we have at least one filter
            if (!noFilters) {
              try
              {
                Utils.styleService.loadAndRegisterSheet(styleURL, Ci.nsIStyleSheetService.USER_SHEET);
                ElemHide.applied = true;
                logger.log('applied fine');
                registry.register('apply_css', false);
                resolve();
              }
              catch (e)
              {
                Cu.reportError(e);
                logger.log('applied with error, rejecting');
                registry.register('apply_css', false);
                reject(e);
              }
            } else /* no filters */{
              logger.log('tried to apply, but no filters found, exiting silently');
              registry.register('apply_css', false);
              resolve();
            }



          }
        }.bind(me));

        me._applying = true;
      });
    } catch (e){
      logger.log('error in apply:'+e.message+'\n'+e.stack);
    }
  },

  _generateCSSContent: function*()
{
  logger.log('start writting file');
  // Grouping selectors by domains
  let domains = Object.create(null);
  let hasFilters = false;
  if(filterByKey) {
    for (let key in filterByKey)
    {
      let filter = filterByKey[key];
      let domain = filter.selectorDomain || "";

      let list;
      if (domain in domains){
        list = domains[domain];
      } else {
        list = Object.create(null);
        domains[domain] = list;
      }
      list[filter.selector] = key;
      hasFilters = true;
    }
  }

  if (!hasFilters) {
    logger.log('has no filters');
    throw Cr.NS_ERROR_NOT_AVAILABLE;
  }


  function escapeChar(match)
  {
    return "\\" + match.charCodeAt(0).toString(16) + " ";
  }

  // Return CSS data
  let cssTemplate = "-moz-binding: url(about:abp-elemhidehit?%ID%#dummy) !important;";
  for (let domain in domains)
  {
    let rules = [];
    let list = domains[domain];

    if (domain){
      if(this._stopped) return;
      yield ('@-moz-document domain("' + domain.split(",").join('"),domain("') + '"){').replace(/[^\x01-\x7F]/g, escapeChar);
    } else {
      if(this._stopped) return;
      // Only allow unqualified rules on a few protocols to prevent them from blocking chrome
      yield '@-moz-document url-prefix("http://"),url-prefix("https://"),'
      + 'url-prefix("mailbox://"),url-prefix("imap://"),'
      + 'url-prefix("news://"),url-prefix("snews://"){';
    }

    for (let selector in list){
      if(this._stopped) return;
      yield selector.replace(/[^\x01-\x7F]/g, escapeChar) + "{" + cssTemplate.replace("%ID%", list[selector]) + "}";
    }
    yield '}';
  }
  logger.log('ends writting');
  yield ' '; //
},


  _stopped: false,
  stop: function () {
    if(this._applying){
      this._stopped = true;
    }
  },

/**
 * Unapplies current stylesheet URL
 */
unapply: function()
{
  if (ElemHide.applied)
  {
    try
    {
      logger.log('unaply happaned');
      Utils.styleService.unregisterSheet(styleURL, Ci.nsIStyleSheetService.USER_SHEET);
    }
    catch (e)
    {
      Cu.reportError(e);
    }
    ElemHide.applied = false;
  }
},


removeFile: function () {
  return new Promise(function (r,j) {
    IO.removeFile(styleURL.file, function(e) {
      if(e){
        logger.log('error during external file deletion:'+e.message+'\n'+e.stack);
      }
      r();
    });
  });
},

/**
 * Retrieves the currently applied stylesheet URL
 * @type String
 */
get styleURL()
{
  return ElemHide.applied ? styleURL.spec : null;
},

/**
 * Retrieves an element hiding filter by the corresponding protocol key
 */
getFilterByKey: function(/**String*/ key) /**Filter*/
{
  return (key in filterByKey ? filterByKey[key] : null);
},


getSize: function(){
  return Object.keys(keyByFilter).length;
},

isRunning: function(){
  return this._applying;
},

/**
 * Checks whether an exception rule is registered for a filter on a particular
 * domain.
 */
getException: function(/**Filter*/ filter, /**String*/ docDomain) /**ElemHideException*/
{
  if (!(filter.selector in exceptions))
    return null;

  let list = exceptions[filter.selector];
  for (let i = list.length - 1; i >= 0; i--)
    if (list[i].isActiveOnDomain(docDomain))
      return list[i];

  return null;
}

};

// es6, motherfucker, and it's polyfills have slightly different behaviour
module.exports = function () {
  return ElemHide;
};