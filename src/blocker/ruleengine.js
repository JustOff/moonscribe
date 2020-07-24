var registry = require('./../registry.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var storage = require('./../storage.js');
var settings = require('./../settings.js');
var logger = new (require('./../misc/logger.js'))(['blocker', 'dom']);

var UpdatableResource = require('./../misc/updatableresource.js');
let {defaultMatcher} = require('./matcherinternal.js');

var socialResource;
var trackerResource;
var easyResource;
const switchSocialEventName = 'fanboySwitch';
const switchTrackerEventName = 'antitrackerSwitch';
const switchEasyEventName = 'easySwitch';

let desigioner = require('./desigioner.js');



let opexec = require('./opexec.js');


// rule sets
var activeRules = Object.create(null);

let globalWhiteListSet = '';

let actualProcessUpdate = function () {
  try{
    return new Promise(function (resolve) {
      try{
        desigioner.clear();
        desigioner.clearOld().then(function () {
          activeRules['whitelist'] = globalWhiteListSet;
          logger.log('rules size for loading:'+Object.keys(activeRules).length+' ('+Object.keys(activeRules)+') ');
          for(let pr in activeRules){
            desigioner.load(activeRules[pr].split("\n"));
          }
          return desigioner.applyIt();
        }).then(function () {
            try{
              logger.log('after loading size whitelist is:'+Object.keys(defaultMatcher.whitelist.filterByKeyword).length+', and blacklist: '+Object.keys(defaultMatcher.blacklist.filterByKeyword).length);
            } catch (e) {
              logger.log('we live in undertemined world, any your world could be not true:'+e.message+'\n(stack is):'+e.stack);
            }
            resolve()
          });
      } catch (e){
        logger.error('wtf promise2', e);
      }
    });
  } catch (e){
    logger.error('wtf promise', e);
  }
};


let bindUIWhiteListEvents = function () {

  registry.onEvent('siteAddToWhitelist', function (baseDomain) {

    var list = globalWhiteListSet.split('\n');
    var rule = "@@||" + baseDomain + "^$document";
    if(list.indexOf(rule) === -1){
      list.push(rule);
    }

    globalWhiteListSet = list.join('\n');

    desigioner.stop();
    opexec(function () {
      return new Promise(function (resolve, reject) {
        actualProcessUpdate().then(resolve);
      })
    })
  });

  registry.onEvent('siteRemoveFromWhitelist', function (baseDomain) {
    var list = globalWhiteListSet.split('\n');
    var rule = "@@||" + baseDomain + "^$document";
    if(list.indexOf(rule)>-1){
      list.splice(list.indexOf(rule), 1);
    }
    globalWhiteListSet = list.join('\n');
    desigioner.stop();
    opexec(function () {
      return new Promise(function (resolve, reject) {
        actualProcessUpdate().then(resolve);
      })
    })
  });
};


module.exports = {
  loadRuleEngine: function(){

    trackerResource = new UpdatableResource({
      resourceName: 'trackerResource',
      localUrl: 'data/data/easyprivacy.txt',
      updateInterval: settings.INTERVALS.EASYPRIVACY_UPDATE,
      remoteUrl: settings.SRVC.EASYPRIVACY
    });

    socialResource = new UpdatableResource({
      resourceName: 'socialResource',
      localUrl: 'data/data/fanboy-social.txt',
      updateInterval: settings.INTERVALS.FANBOY_UPDATE,
      remoteUrl: settings.SRVC.FANBOY
    });

    easyResource = new UpdatableResource({
      resourceName: 'easyResource',
      localUrl: 'data/data/easylist.txt',
      updateInterval: settings.INTERVALS.EASY_UPDATE,
      remoteUrl: settings.SRVC.EASY
    });

    var panel = registry.resolve('panel');

    var processRulesCategory = function ({prefix, resource, uiswitchevent, turnOnOnStart}) {
      if(typeof turnOnOnStart === "undefined"){
        turnOnOnStart = true;
      }
      

      var updateData = function () {
        return new Promise(function (resolve, reject) {
          try {
            if(registry.has(prefix+'State') && (registry.resolve(prefix+'State') === true)){
              logger.log('processDataUpdate for '+prefix+', where state is true');
              activeRules[prefix] = resource.getLastData();
            } else {
              logger.log('processDataUpdate for '+prefix+', where state is false');
              delete activeRules[prefix];
            }
            actualProcessUpdate().then(resolve);
          } catch (e){
            logger.error('inside of update', e);
          }
        });
      };
      var processDataUpdate = function () {
        logger.log('send '+prefix+' for execution');
        desigioner.stop();
        opexec(updateData);
      };

      resource.onResourceUpdate(processDataUpdate);

      panel.port.on(uiswitchevent, function (isTurnedOnNow) {
        // persist only from UI from user
        storage.setJSON(prefix+'PersistState', isTurnedOnNow);
        logger.log('process UI event from '+prefix+', new state is:'+ isTurnedOnNow);
        registry.emitEvent(uiswitchevent, isTurnedOnNow);
      });


      var switchCategory = function (isTurnedOnNow, resource, prefix) {
        return new Promise(function (resolve, reject) {
          isTurnedOnNow = !!isTurnedOnNow;
          if(isTurnedOnNow){
            resource.loadFile().then(function () {
              registry.register(prefix+'State', true);
              processDataUpdate();
              resolve();
            })
          } else {
            registry.register(prefix+'State', false);
            processDataUpdate();
            return resolve();
          }
        });
      };

      registry.onEvent(uiswitchevent, function (isTurnedOnNow) {
        switchCategory(isTurnedOnNow, resource, prefix);
      });


      registry.onEvent('logout', function () {
        registry.emitEvent(uiswitchevent, false);
        resource.shutdown();
      });

      registry.onEvent('shutdown', function () {
        resource.shutdown();
      });

      // process remembered state
      if(storage.has(prefix+'PersistState')){
        if(storage.getJSON(prefix+'PersistState') === false){
          turnOnOnStart = false;
        } else /* not false */{
          turnOnOnStart = true;
        }
      }

      logger.log('processing prefix:'+prefix+' and isTurnOn is:'+turnOnOnStart);
      if(turnOnOnStart){
        logger.log(prefix+'PersistState is true or is not set, anyway turning on this, and return promise' );
        return switchCategory(true, resource, prefix); // need also UI rendering
      } else {
        logger.log(prefix+'PersistState is off for purpose, return resolved promise' );
        storage.setJSON(prefix+'PersistState', false);
        registry.emitEvent(uiswitchevent, false);
        return Promise.resolve(true);
      }
    };

    logger.log('returning promise from load rule engine');

    bindUIWhiteListEvents();

    // concurrent race somewhere here, solving temporary by executing promises one by one
    return Promise.resolve().then(function () {
      return processRulesCategory({
        uiswitchevent: switchTrackerEventName,
        resource: trackerResource,
        prefix: 'antitracker'
      });
    }).then(function () {
      return processRulesCategory({
        uiswitchevent: switchSocialEventName,
        resource: socialResource,
        prefix: 'antisocial',
        turnOnOnStart: false
      });
    }).then(function () {
      return processRulesCategory({
        uiswitchevent: switchEasyEventName,
        resource: easyResource,
        prefix: 'easy'
      });
    });

  }
};