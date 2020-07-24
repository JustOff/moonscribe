// windscribe
// jpm run -p tester -b "C:\Program Files (x86)\Nightly\firefox.exe"
// xpinstall.signatures.required
// extensions.logging.enabled
// extensions.sdk.console.logLevel = "all"



var debuggerConnectDelayedStart = 0; // use this
// var debuggerConnectDelayedStart = 30000; // this for debugger purposes only

let Logger = new require('./src/misc/logger.js');
Logger.setCategories([/* 'blocker', 'whitelist', 'main' , 'dom', 'uarotator', ''*/'']);
logger = new Logger(['main']);


var self = require("sdk/self");
var tabs = require('sdk/tabs');
var {purgeStorageOnUninstall} = require('./src/misc/purgeStorage.js');
var registry = require("./src/registry.js");
var {unregisterNetworkListener, registerNetworkListener} = require('./src/misc/networkListener.js');
var { checkSecureLink, reportMessage, getCurrentUrl, turnOffProxy, hasActiveSession, setDefaultPac} = require('./src/common_helpers.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");
var { ToggleButton } = require('sdk/ui/button/toggle');
var panels = require("sdk/panel");
var events = require("sdk/system/events");
var Windscribe = require('./src/windscribe.js');
var clipboard = require("sdk/clipboard");
var {doVersionCheck}          = require('./src/misc/versioner.js');
var { stopSessionUpdate } = require('./src/misc/sessionupdate.js');
var prefService = require("sdk/preferences/service");
var purgeStorage = require('./src/misc/purgeStorage.js');
require('./src/misc/loginDirect.js');
require('./src/misc/loginWithStoredCredentials.js');
var myplatform = require("./src/misc/platformResoler.js");
var storage = require('./src/storage.js');
const { sessionUpdateFunction } = require('./src/misc/sessionupdate');
var settings = require('./src/settings.js');
var isMac = (myplatform === 'Macintosh');
var width = isMac?355:354;
var height = isMac?337:335;


var doPreInit = function(loadReason){
  logger.log('loadReason:'+loadReason);
  if (loadReason==='install') {
    purgeStorageOnUninstall();
  }
  // no action for this: loadReason==='upgrade'
  prefService.set('extensions.sdk.logger.logLevel', 'all');
  prefService.set('extensions.'+self.id+'.sdk.console.logLevel', 'all');
  purgeStorage.init();
  doVersionCheck(loadReason);
  storage.reset('failedUpdateSessionCounter');
  storage.reset('locations_revision_number');
};


var initUI = function () {
 // todo: add debugger
  var button = ToggleButton({
    id: "moonscribe",
    aId: "moonscribe",
    label: "Moonscribe",
    icon: {
      "16": "./icons/16x16_off.png",
      "32": "./icons/32x32_off.png",
      "64": "./icons/64x64_off.png"
    },
    onChange: handleChange
  });

  /*
   It is possible change 'contentURL' for existing panel, but there is no
   way to do this with 'contentScriptFile' and 'contentStyleFile' properties.
   First idea was reinit panel entirely.
   But during reinit the panel is blinking. Blinking panel looks awful.
   Another way of doing this will be put evrything into one file with
   sections and play with "display: none" for hidden sections,
   thats solution is implemented here.
   */
  var panel = panels.Panel({
    contentURL: self.data.url("panel.html"),
    contentScriptFile: [
      self.data.url("panel-script.js"),
      self.data.url('libs/common_functions.js'),
      self.data.url('libs/CSSClass.js'),
      self.data.url('libs/jss.js'),
      self.data.url('libs/perfect-scrollbar/perfect-scrollbar.js'),
      self.data.url('libs/jsonToDOM.js')
    ],
    contentStyleFile: [
      self.data.url("panel-style.css"),
      self.data.url('libs/perfect-scrollbar/perfect-scrollbar.css')
    ],
    onHide: handleHide
  });

  function handleHide() {
    button.state('window', {checked: false});
  }

  function handleChange(state) {
    if (state.checked) {
      panel.show({
        position: button,
        width: width,
        height: height
      });

      panel.on('show', function(){
        panel.port.emit('update_ui');
        // bypass login
        // windscribe.signIn({name: 'name', passw: 'passw'});
      })
    } else {
      panel.port.emit('update_ui');
    }
  }

  panel.on('show', function() {
    storage.has('session_auth_hash') && sessionUpdateFunction();
  });


  registry.register('makeOnline', function(icon){
    switch (icon){
      case registry.constants.icon.blue:
        button.icon = {
          "16": "./icons/16x16_on.png",
          "32": "./icons/32x32_on.png",
          "64": "./icons/64x64_on.png"
        };
        break;
      case registry.constants.icon.grey:
        button.icon = {
          "16": "./icons/16x16_off.png",
          "32": "./icons/32x32_off.png",
          "64": "./icons/64x64_off.png"
        };
        break;
      case registry.constants.icon.doubleHop:
        button.icon = {
          "16": "./icons/32x32_on_doublehop.png",
          "32": "./icons/32x32_on_doublehop.png",
          "64": "./icons/64x64_on_doublehop.png"
        };
        break;
      case registry.constants.icon.error:
        button.icon = {
          "16": "./icons/16x16_off.png",
          "32": "./icons/32x32_off.png",
          "64": "./icons/64x64_off.png"
        };
        break;
    }
  });

  return {panel, button};
};


var initModules = function (panel, loadReason) {
  // these modules depends on 'panel'
  registry.register('panel', panel);

  try{ require('./src/misc/panel.js').init(); } catch (e){ logger.error('error during init of /src/misc/panel.js', e); }

  try{ require('./src/misc/firstRun.js').init(); } catch (e){ logger.error('error during init of /src/misc/firstRun.js', e); }

  try{ require('./src/misc/checkMode.js').init(); } catch (e){ logger.error('error during init of /src/misc/checkMode.js', e); }

  try{ require('./src/misc/siteRegistration.js').init(loadReason); } catch (e){ logger.error('error during init of /src/misc/siteRegistration.js', e); }


  var windscribe = new Windscribe(panel);

  // setInterval(function () {
  //   panel.port.emit('main_traffic_ends');
  // }, 35000);


  registerNetworkListener();
  return {windscribe};
};

exports.main = function({ loadReason }) {
  setTimeout(function () {
    doPreInit(loadReason);

    var {panel} = initUI();

    // log messages from HTML UI thread
    panel.port.on('log', function(mess){ console.log(mess); });
    initModules(panel, loadReason);

    // switcher val is false initially
    registry.register('proxy_state_remember', 'Off');

    registry.emitEvent('switchToDefaultScreen');
    registry.emitEvent('checkActiveSessions');
  }, debuggerConnectDelayedStart);
};

exports.onUnload = function (reason) {
    logger.log('shoutdown, reasone:'+reason);

    if(reason == "uninstall"){
      purgeStorageOnUninstall();
    }
    stopSessionUpdate();

    if (reason === "shutdown") {
      setDefaultPac()
    } else {
      try{
        var panel = registry.resolve('panel');
        turnOffProxy(panel, false /* change state */, true /* call from onUnload */);
      } catch (e){ console.log('turningOffProxy error ', e)}
    }
    unregisterNetworkListener();

    if (reason == "uninstall") {
      tabs.open(settings.EXTERNAL_URL_OPEN_ON_UNINSTALL);
    }

    registry.emitEvent('shutdown');
};