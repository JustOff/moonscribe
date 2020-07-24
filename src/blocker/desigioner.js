try{

  let Utils = require('./util.js').Utils;
  var settings = require('./../settings.js');
  let {defaultMatcher} = require('./matcherinternal.js');
  let {BlockingFilter, WhitelistFilter, RegExpFilter, Filter, ElemHideBase, CSSPropertyFilter} = require("./filterClasses.js");
  const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");
  var storage = require('./../storage.js');

  var Whitelist = require("./../misc/whitelist.js");

  let ElemHide = require('./elemHide.js')();

  let { debounce } = require("sdk/lang/functional");
  var logger = new (require('./../misc/logger.js'))(['blocker', 'dom']);
  var domLogger = new (require('./../misc/logger.js'))(['dom']);
  var registry = require('./../registry.js');


// run from closure?
  "use strict";

  let {XPCOMUtils} = Cu.import("resource://gre/modules/XPCOMUtils.jsm", {});
  let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});


  var whitelistSchemes = new Set();
  for (let scheme of settings.whitelistschemes.toLowerCase().split(" ")){
    this.whitelistSchemes.add(scheme);
  }

  /**
   * Set of explicitly supported content types
   * @type Set.<string>
   */
  var contentTypes = new Set([
    "OTHER", "SCRIPT", "IMAGE", "STYLESHEET", "OBJECT", "SUBDOCUMENT", "DOCUMENT",
    "XMLHTTPREQUEST", "OBJECT_SUBREQUEST", "FONT", "MEDIA", "ELEMHIDE", "POPUP",
    "GENERICHIDE", "GENERICBLOCK"
  ]);

  var nonVisualTypes = new Set([
    "SCRIPT", "STYLESHEET", "XMLHTTPREQUEST", "OBJECT_SUBREQUEST", "FONT",
    "ELEMHIDE", "POPUP", "GENERICHIDE", "GENERICBLOCK"
  ]);

  /**
   * Processes nodes scheduled for post-processing (typically hides them).
   */
  var postProcessNodes = function()
  {
    try{
      // console.log('collapsed function start');
      registry.emitEvent('getCollapsedClass').then(cls =>
      {
        let nodes = scheduledNodes;
        scheduledNodes = null;

        // Resolving class is async initially so the nodes might have already been
        // processed in the meantime.
        if (!nodes)
          return;

        for (let node of nodes)
        {
          // adjust frameset's cols/rows for frames
          let parentNode = node.parentNode;
          if (parentNode && parentNode instanceof Ci.nsIDOMHTMLFrameSetElement)
          {
            let hasCols = (parentNode.cols && parentNode.cols.indexOf(",") > 0);
            let hasRows = (parentNode.rows && parentNode.rows.indexOf(",") > 0);
            if ((hasCols || hasRows) && !(hasCols && hasRows))
            {
              let index = -1;
              for (let frame = node; frame; frame = frame.previousSibling)
                if (frame instanceof Ci.nsIDOMHTMLFrameElement || frame instanceof Ci.nsIDOMHTMLFrameSetElement)
                  index++;

              let property = (hasCols ? "cols" : "rows");
              let weights = parentNode[property].split(",");
              weights[index] = "0";
              parentNode[property] = weights.join(",");
            }
          }
          else
            node.classList.add(cls);
        }
      });
    } catch (e){
      logger.error('error in postProcessNodes', e);
    }

  };

  /**
   * Nodes scheduled for post-processing (might be null).
   * @type Node[]
   */
  let scheduledNodes = null;

  /**
   * Schedules a node for post-processing.
   */
  var schedulePostProcess = function(/**Element*/ node)
  {
    if (scheduledNodes)
      scheduledNodes.push(node);
    else
    {
      scheduledNodes = [node];
      Utils.runAsync(postProcessNodes);
    }
  };

  var Desigioner = function () {
    try{
      var me = this;

      me.processPolicyResponse = function (window, node, response) {
        var {allow, collapse} = response;
        if (collapse){
//           console.log('we do have collapsed element:'+node);
          schedulePostProcess(node);
        }
        return allow;
      };





      // cleaning done one level upper
      me.load = function (/* [string] */rules) {

        // entry for resting pop-up close on http://new-rutor.org/search/, see RuAdList 
        rules.push('/cu.redirect$popup,domain=new-rutor.org|xrutor.org');
        var counterOfElemRules = 0;
        domLogger.log('ElemHide state dirty in Desigioner.load (start):'+ElemHide.isDirty+', rules size is:'+rules.length);
        domLogger.log('ElemHide size before is:'+ElemHide.getSize());
        for (var i = 0; i < rules.length; i++) {
          var rule = ''+rules[i];
          if (rule.trim().length === 0) {
            continue;
          }
          var filter = Filter.fromText(rule);

          if(filter instanceof BlockingFilter){
            defaultMatcher.add(filter);
          } else if (filter instanceof WhitelistFilter){
            defaultMatcher.add(filter);
          } else if(filter instanceof ElemHideBase) {
            try{
              if (filter instanceof CSSPropertyFilter){
                // logger.log("CSSPropertyFilter:"+filter);
              } else {
                counterOfElemRules++;
                ElemHide.add(filter);
              }
            } catch (e){
              logger.log('error!: '+e.message+'\n'+e.stack);
              throw e;
            }
          }
        }

        domLogger.log('ElemHide state dirty in Desigioner.load (end):'+ElemHide.isDirty);
        domLogger.log('ElemHide size after is:'+ElemHide.getSize()+', but counterOfElemRules:'+counterOfElemRules);

      };

      me.clear = function () {
        defaultMatcher.clear();
        ElemHide.clear();
      };

      me.applyIt = function () {
        return ElemHide.apply();
      };

      me.stop = function () {
        ElemHide.stop();
      };

      me.clearOld = function () {
        ElemHide.unapply();
        return ElemHide.removeFile();
      };


      var isBlockableScheme = function (location) {
        var scheme;
        if(typeof loc == 'string'){
          let match = /^([\w\-]+):/.exec(location);
          scheme = match ? match[1] : null;
        } else {
          scheme = location.scheme;
        }
        return !whitelistSchemes.has(scheme);
      };


      /**
       * Checks whether the location's origin is different from document's origin.
       */
      var isThirdParty = function(/**String*/location, /**String*/ docDomain) /**Boolean*/
      {
        if (!location || !docDomain)
          return true;

        let uri = Utils.makeURI(location);
        try
        {
          return Utils.effectiveTLD.getBaseDomain(uri) != Utils.effectiveTLD.getBaseDomainFromHost(docDomain);
        }
        catch (e)
        {
          // EffectiveTLDService throws on IP addresses, just compare the host name
          let host = "";
          try
          {
            host = uri.host;
          } catch (e) {}
          return host != docDomain;
        }
      };

      var isResourceBlockedOrCollapsed = function ({location, contentType, frames, isPrivate}) {

        if((''+location).indexOf('facebook.com')>-1){
          let debuggercode = true;
        }

        function response(allow, collapse){
          return {allow: allow, collapse: collapse};
        }

        // Ignore whitelisted schemes
        if(!isBlockableScheme(location)){
          return response(true, false);
        }

        // Interpret unknown types as "other"
        if (!contentTypes.has(contentType)){
          contentType = "OTHER";
        }

        let wndLocation = frames[0].location;
        let docDomain = Utils.getHostname(wndLocation);
        if(Whitelist.isWhitelisted(docDomain)){
          return response(true, false);
        }

        let match = null;
        let [sitekey, sitekeyFrame] = [null, null];
        let nogeneric = false;
        if (!match){
          let testSitekey = sitekey;
          let testSitekeyFrame = sitekeyFrame;
          for (let i = 0; i < frames.length; i++) {
            let frame = frames[i];
            let testWndLocation = frame.location;
            let parentWndLocation = frames[Math.min(i + 1, frames.length - 1)].location;
            let parentDocDomain = Utils.getHostname(parentWndLocation);

            let typeMap = RegExpFilter.typeMap.DOCUMENT;
            if (contentType == "ELEMHIDE"){
              typeMap = typeMap | RegExpFilter.typeMap.ELEMHIDE;
            }
            let whitelistMatch = defaultMatcher.matchesAny(testWndLocation, typeMap, parentDocDomain, false, testSitekey);

            if (whitelistMatch instanceof WhitelistFilter) {
              return response(true, false);
            }

            let genericType = (contentType == "ELEMHIDE" ? "GENERICHIDE" : "GENERICBLOCK");
            let nogenericMatch = defaultMatcher.matchesAny(testWndLocation,
              RegExpFilter.typeMap[genericType], parentDocDomain, false, testSitekey);

            if (nogenericMatch instanceof WhitelistFilter) {
              nogeneric = true;
            }

          }
        } // end of frame checking

        if (!match && contentType == "ELEMHIDE"){
          var originalLocation = location;
          match = ElemHide.getFilterByKey(location);
          try{
            location = match.text.replace(/^.*?#/, '#');
            logger.log('1) applied get rule from:'+match+', whats taken by key:'+originalLocation+' for '+location);
          } catch (e){
            logger.error('ailed get rule id from:'+match+', whats taken by key:'+location, e);
          }

          // inject whitelist checking
          // let docDomain = Utils.getHostname(location);
          // if(isWhitelisted(docDomain)){
          //    return response(true, false);
          // }
          // end of whitelist checking

          if (!match.isActiveOnDomain(docDomain))
            return response(true, false);

          let exception = ElemHide.getException(match, docDomain);
          if (exception) {
            return response(true, false);
          }

          if (nogeneric && match.isGeneric()){
            return response(true, false);
          }
        } // end of part for DOM manipulation

        let thirdParty = (contentType == "ELEMHIDE" ? false : isThirdParty(location, docDomain));
        let collapse = false;
        if (!match && RegExpFilter.typeMap.hasOwnProperty(contentType))
        {
          match = defaultMatcher.matchesAny(location, RegExpFilter.typeMap[contentType],
            docDomain, thirdParty, sitekey , nogeneric);
          if(match != null){
            if (match instanceof BlockingFilter && !nonVisualTypes.has(contentType)){
              collapse = (match.collapse != null ? match.collapse : true); // see fastcollapse from original
            }
          }
        }
        return response(!match || match instanceof WhitelistFilter, collapse);
      };



      /**
       * Asynchronously checks whether a request should be allowed.
       * @param {nsIDOMWindow} window
       * @param {nsIDOMElement} node
       * @param {String} contentType
       * @param {String} location location of the request, filter key if contentType is ELEMHIDE
       * @param {Function} callback  callback to be called with a boolean value, if
       *                             false the request should be blocked
       */
      me.shouldAllowAsync = function (window, node, contentType, location, callback) {
        try{

          let allow = me.shouldAllow(window, node, contentType, location);
          callback(allow);
        } catch (e){
          logger.error('shouldAllowAsync failed because of', e);
          callback(true);
        }
      };


      /**
       * Checks whether a request should be allowed, hides it if necessary
       * @param {nsIDOMWindow} window
       * @param {nsIDOMElement} node
       * @param {String} contentType
       * @param {String} location location of the request, filter key if contentType is ELEMHIDE
       * @return {Boolean} false if the request should be blocked
       */
      me.shouldAllow = function(window, node, contentType, location){
        return me.processPolicyResponse(window, node, isResourceBlockedOrCollapsed({
          contentType: contentType,
          location: location,
          frames: Utils.getFrames(window),
          isPrivate: Utils.isPrivate(window)
        }));
      };


      me.size = function () {
        return Object.keys(defaultMatcher.blacklist.filterByKeyword).length + Object.keys(defaultMatcher.whitelist.filterByKeyword).length;
      };

      // XXX: move it to the end of construction because of CIRCULAR REFERENCE!
      // inside init method we referenced to yet not defined via me[...] property
      ElemHide.init();
    } catch (e){
      logger.error('error during initiating of Desigioner', e);
    }
  };

module.exports = new Desigioner();
} catch (e){
  console.log('global exception catcher:'+e.message+'\n'+e.stack);
}
