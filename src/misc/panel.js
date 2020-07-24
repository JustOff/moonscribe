var WL_WRONG_SITE          = 'E';
var WL_REMOVED             = '0';
var WL_ADDED               = '1';
var WL_ADDED_PLUS_NO_PROXY = '2';

var loggerA = new (require('./logger.js'))(['blocker']);
var loggerB = new (require('./logger.js'))(['whitelist']);
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var {Request, TryBackupException} = require("./request.js");
var {getEndpoint, getCurrentUrl, getWithSessionedSigning, isSupportedProtocol, isNoInternetErrorCode} = require('./../common_helpers.js');
var Whitelist = require("./whitelist.js");

var registry = require('./../registry.js');
var storage = require('./../storage.js');
let Utils = require('./util.js').Utils;
const { Ci, Cu, Cc, Cr, components} = require('chrome');
let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});

module.exports = {
  init: function () {

    var panel = registry.resolve('panel');
    
    panel.port.on('whitelist_init', function(){
      loggerB.log('Initialize whitelist...');
      try {
        var whiteList =  Whitelist.getList();
        // console.log('whiteList: '+ JSON.stringify(whiteList));
        panel.port.emit('whitelist_init_done', whiteList );
      } catch (e){
        loggerB.error('problem initializing whitelist', e);
      }
    });

    /**
     * state - true if we adding it to list, otherwise false
     */
    panel.port.on('change_site_whitelisted', function (options) {
      var {toBeAdded, site, isOpenedFromOptions, currentSite, isWithProxy = false, mess} = options;
      
      loggerB.log('change_site_whitelisted called with: toBeAdded:'+toBeAdded+', site'+site);

      if(!isSupportedProtocol(site)) {
        panel.port.emit('change_site_whitelisted_done', {valid: false}, Whitelist.getList(), isOpenedFromOptions);
        return;
      }


      // get domain from url
      try{
        var baseDomain = Whitelist.getBaseDomain(site);
      } catch (e){
        loggerB.error('problem getting efective domain name(change_site_whitelisted)', e);
        panel.port.emit('change_site_whitelisted_done', {valid: false}, Whitelist.getList(), isOpenedFromOptions);
        // no cheese fo you
        return;
      }



      if(toBeAdded){
        if(isWithProxy){
          Whitelist.addSite(site, false);
        } else {
          Whitelist.addSite(site);
        }
      } else {
        Whitelist.removeSite(site);
      }

      if(toBeAdded){
        registry.emitEvent('siteAddToWhitelist', baseDomain);
      } else {
        registry.emitEvent('siteRemoveFromWhitelist', baseDomain);
      }


      let isCurr = false;
      var isCurWL;
      try{
        var currentSiteBaseDomain = Whitelist.getBaseDomain(currentSite);
        isCurr = (currentSiteBaseDomain === baseDomain);
        isCurWL = Whitelist.isWhitelisted(currentSiteBaseDomain, false) ? WL_ADDED : WL_REMOVED;
      } catch (e){
        isCurWL = WL_WRONG_SITE;
      }


      // console.log('going to whitelist with message: '+mess);
      panel.port.emit('change_site_whitelisted_done', {
        valid: true,
        isWhiteListed: toBeAdded,
        isCurr: isCurr,
        isCurWL: isCurWL,
        mess: mess
      } , Whitelist.getList(), isOpenedFromOptions);
    });


    panel.port.on('check_site_whitelisted', function(currentSite){

      if(!isSupportedProtocol(currentSite)) {
        panel.port.emit('check_site_whitelisted_done', {valid: false});
        return;
      }

      // get domain from url
      try {
        var baseDomain = Whitelist.getBaseDomain(currentSite)
      } catch (e) {
        panel.port.emit('check_site_whitelisted_done', {valid: false});
        // no cheese fo you
        return;
      }

      // Ads Only + No Proxy
      // &&
      // Ads Only

      var whitelisted = Whitelist.isWhitelisted(baseDomain, false);
      // console.log('returning to UI baseDomain:'+baseDomain+', whitelisted:'+whitelisted);
      panel.port.emit('check_site_whitelisted_done', {valid: true, isWhiteListed: whitelisted});
    });

    registry.onEvent('url_changed', function(site){
      setTimeout(function () {

        if(!isSupportedProtocol(site)) {
          panel.port.emit('check_site_whitelisted_done', {valid: false});
        }

        // get domain from url
        try {
          var baseDomain = Whitelist.getBaseDomain(site);
        } catch (e) {
          loggerB.error('problem getting efective domain name(url_changed):' + e);
          panel.port.emit('check_site_whitelisted_done', {valid: false});
          // no cheese fo you
          return;
        }

        var isWhitelisted = Whitelist.isWhitelisted(baseDomain);
        panel.port.emit('check_site_whitelisted_done', {valid: true, isWhiteListed: isWhitelisted});
      }, 0);
    });

    panel.port.on('whitelist_report', function() {
      return new Promise(function (resolve, reject) {
        try {
          var content = getWithSessionedSigning({});
          content.rep_url = getCurrentUrl();
        } catch (e) {
          return reject('we are not query whitelist report if there is no session');
        }

        Request({
          url: getEndpoint("/Report/whitelist"),
          content: content,
          onComplete: function (response) {
            if (isNoInternetErrorCode(response)) {
              if(!response.isBackup){
                throw new TryBackupException();
              }
              return;
            }
            loggerB.log('POST to whitelist report');
            panel.port.emit('whitelist_report_done');
            resolve(response);
          }
        }).post();
      });
    });

    // Generate class identifier used to collapse nodes and register
    // corresponding stylesheet.
    let collapsedClass = "";
    let offset = "a".charCodeAt(0);
    for (let i = 0; i < 20; i++){
      collapsedClass +=  String.fromCharCode(offset + Math.random() * 26);
    }

    let classBody = "{-moz-binding: url(chrome://global/content/bindings/general.xml#foobarbazdummy) !important;}";
    let collapseStyle = Services.io.newURI("data:text/css," + encodeURIComponent("." + collapsedClass + classBody), null, null);
    registry.onEvent('shutdown', ()=>{ // error is somewhere here
      Utils.styleService.unregisterSheet(collapseStyle, Ci.nsIStyleSheetService.USER_SHEET);
    });
    Utils.styleService.loadAndRegisterSheet(collapseStyle, Ci.nsIStyleSheetService.USER_SHEET);



    registry.onEvent('getCollapsedClass', function () {
      return new Promise(function (resolve, reject) {
        return resolve(collapsedClass);
      });
    });

  }
};
