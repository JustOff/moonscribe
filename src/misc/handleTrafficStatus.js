var storage = require('./../storage.js');
var registry = require('./../registry.js');

var { turnOffProxy, turnOnProxy, isProxied } = require('./../common_helpers.js');


function handleTrafficStatus(){

  var panel = registry.resolve('panel');
  var isPremium = storage.get('is_premium');
  var wasPremiumBefore;
  if(storage.has('was_premium')){
    wasPremiumBefore = storage.get('was_premium');
  } else {
    wasPremiumBefore = isPremium;
  }
  var status = storage.get('status');


  if(status == 1){ // user ok
    if(!isPremium){
      var traffic_max = storage.get('traffic_max');
      var traffic_used = storage.get('traffic_used');
      var remainingTraffic = Number(((Number(traffic_max) - Number(traffic_used))/1073741824).toFixed(2));
      if(remainingTraffic >= 10){
      } else if(remainingTraffic >= 1 && remainingTraffic < 10){
        remainingTraffic = remainingTraffic.toFixed(1);
      }
      panel.port.emit('main_traffic_left', remainingTraffic);
    }
    if(storage.has('proxyStateBeforeExpiration')){
      var proxyStateBeforeExpiration = storage.get('proxyStateBeforeExpiration');
      storage.reset('proxyStateBeforeExpiration');
      if(proxyStateBeforeExpiration === 1){
        turnOnProxy(true);
      }
    }
  } else if(status == 2){  // subscription ends
    storage.set('proxyStateBeforeExpiration', isProxied()?1:0);
    panel.port.emit('main_traffic_ends');
    turnOffProxy(panel, true);
    storage.reset('ext_username');
  } else if(status == 3){ // premium can be banned too
    panel.port.emit('main_traffic_banned');
    turnOffProxy(panel, true);
  }


  if(isPremium){
    if(!wasPremiumBefore){
      // console.log('calling update server list not wasPremiumBefore');
      registry.emitEvent('locations_update_event', true);
    }

    if((storage.has("rebill") && storage.get("rebill") === 0) || !storage.has("rebill")){
      var daysLeft = Math.ceil((Date.parse(storage.get("premium_expiry_date")) - Date.now()) / 24*60*60*1000);
      if (Math.round(daysLeft) <= 5) {
        daysLeft = Math.round(daysLeft);
        panel.port.emit('main_traffic_days', daysLeft);
      } else if (Math.round(daysLeft) === 1) {
        panel.port.emit('main_traffic_days', 1);
      } else if (Math.round(daysLeft) <= 0) {
        panel.port.emit('main_traffic_days', 0);
      } else {
        panel.port.emit('main_traffic_premium');
      }
    } else {
      panel.port.emit('main_traffic_premium');
    }
  } else {
    if(wasPremiumBefore){
      // console.log('calling update server list wasPremiumBefore');
      registry.emitEvent('locations_update_event', true);
    }
  }

  storage.set('was_premium', isPremium);
}

var saveTrafficStatus = function (data) {
  if('is_premium' in data){
    storage.set("is_premium", Number(data['is_premium']));
  } else {
    storage.set("is_premium", 0); // either way
  }

  if('rebill' in data){
    storage.set("rebill", Number(data['rebill']));
  } else {
    storage.reset("rebill");
  }

  if('premium_expiry_date' in data){
    storage.set('premium_expiry_date', data['premium_expiry_date']);
  } else {
    storage.reset('premium_expiry_date');
  }

  if("traffic_max" in data){
    storage.set("traffic_max", ""+data['traffic_max']);
  } else {
    storage.reset("traffic_max");
  }

  if("traffic_used" in data){
    storage.set("traffic_used", ""+data['traffic_used']);
  } else {
    storage.reset("traffic_used");
  }

  if("status" in data){
    storage.set("status", Number(data['status']));
  } else {
    storage.set("status", 0);
  }

};



exports.handleTrafficStatus = handleTrafficStatus;
exports.saveTrafficStatus = saveTrafficStatus;