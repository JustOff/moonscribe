/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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
 * @fileOverview Hit counts for element hiding.
 */
let {shouldAllowAsync, shouldAllow} = require('./desigioner.js');


const { components, CC, Cc, Ci, Cr, Cu, Cm} = require("chrome");
const { defer, all, resolve, race } = require('sdk/core/promise');


let {XPCOMUtils} = Cu.import("resource://gre/modules/XPCOMUtils.jsm", {});
let Utils = require('./util.js').Utils;



var logger = new (require('./../misc/logger.js'))(['dom', 'whitelist']);
var registry = require('./../registry.js');
let setTimeout = require('sdk/timers').setTimeout;
let ElemHide = require('./elemHide.js')();


let startTag = '<?xml version="1.0"?>\n'+
  '<bindings ' +
  'xmlns="http://www.mozilla.org/xbl" ' +
  'xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" ' +
  'xmlns:html="http://www.w3.org/1999/xhtml">';
let endTag = '</bindings>';

// The allowXBL binding below won't have any effect on the element. For elements
// that should be hidden however we don't return any binding at all, this makes
// Gecko stop constructing the node - it cannot be shown.
const allowXBL = startTag+"<binding id='dummy' bindToUntrustedContent='true'/>"+endTag;
const hideXBL  = startTag+endTag;


//

/**
 * about: URL module used to count hits.
 * @class
 */
let AboutHandler =
{
  classID: components.ID("{55fb7be0-1dd2-11b2-98e6-9e97caf8ba68}"),
  classDescription: "Element hiding hit registration protocol handler",
  aboutPrefix: "abp-elemhidehit",

  /**
   * Registers handler on startup.
   */
  init: function()
  {
    try{
      logger.log('init of hitchanel fine');
      let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
      if (registrar.isCIDRegistered(this.classID)) {
        registrar.unregisterFactory(this.classID, this);
      }
      let registerFactory = Utils.getPropertyWithoutCompatShims(registrar, "registerFactory");
      registerFactory.call(registrar, this.classID, this.classDescription, "@mozilla.org/network/protocol/about;1?what=" + this.aboutPrefix, this);
    } catch (e){
      logger.error('error in init of hitchannel', e);
    }
  },

  destroy: function () {
    let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.unregisterFactory(this.classID, this);
  },

//
// Factory implementation
//

  createInstance: function(outer, iid)
  {
    if (outer != null)
      throw Cr.NS_ERROR_NO_AGGREGATION;

    return this.QueryInterface(iid);
  },

//
// About module implementation
//

  getURIFlags: function(uri)
  {
    return Ci.nsIAboutModule.HIDE_FROM_ABOUTABOUT;
  },

  newChannel: function(uri, loadInfo)
  {
    try{
      let match = /\?(\d+)/.exec(uri.path);
      if (!match)
        throw Cr.NS_ERROR_FAILURE;
      return new HitRegistrationChannel(uri, loadInfo, match[1]);
    } catch (e){
      logger.log('problem with creating new channel');
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory, Ci.nsIAboutModule])
};


/**
 * Channel returning data for element hiding hits.
 * @constructor
 */
function HitRegistrationChannel(uri, loadInfo, key)
{
  // logger.log('registering new hit channel with uri: '+uri.spec);
  this.key = key;
  this.URI = this.originalURI = uri;
  this.loadInfo = loadInfo;
}


HitRegistrationChannel.prototype = {
  key: null,
  URI: null,
  originalURI: null,
  contentCharset: "utf-8",
  contentLength: 0,
  contentType: "text/xml",
  owner: Utils.systemPrincipal,
  securityInfo: null,
  notificationCallbacks: null,
  loadFlags: 0,
  loadGroup: null,
  name: null,
  status: Cr.NS_OK,

  asyncOpen: function(listener, context)
  {
    var me = this;

    try{
      let processResponse = (allow) =>
      {
        let data = (allow ? allowXBL : hideXBL);
        let stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
        stream.setData(data, data.length);

        try {
          listener.onStartRequest(this, context);
        } catch(e) {}
        try {
          listener.onDataAvailable(this, context, stream, 0, stream.available());
        } catch(e) {}
        try {
          listener.onStopRequest(this, context, Cr.NS_OK);
        } catch(e) {}
      };

      let window = Utils.getRequestWindow(this);
      // magic starts here, this operation SHOULD BE async
      shouldAllowAsync(window, window.document, "ELEMHIDE", me.key, (isAllow)=> {
        setTimeout(function () {
          try {
            logger.log('2) hit '+isAllow+' from asyncOpen for:'+me.key+ ', in:'+window.location.href);
            processResponse(isAllow)
          } catch (e){
            logger.error('error in actual processing asyng hitchannel request', e);
          }
        }, 0);
      });
    } catch (e){
      logger.error('error in opening async');
    };

  },

  asyncOpen2: function(listener)
  {
    if (!this.loadInfo.triggeringPrincipal.equals(Utils.systemPrincipal))
      throw Cr.NS_ERROR_FAILURE;
    this.asyncOpen(listener, null);
  },

  open: function()
  {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  isPending: function()
  {
    return false;
  },
  cancel: function()
  {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  suspend: function()
  {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  resume: function()
  {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIChannel, Ci.nsIRequest])
};


module.exports = function () {
  return AboutHandler;
};