// self.port.emit('log', 'START of uacontentscript');
try{
  (function(){
    'use strict';

    self.port.on('peekUserAgent', function (newUserAgent) {

      if(!newUserAgent){
        // self.port.emit('log', 'no useragent, exiting from peekUserAgent');
        return false;
      }

      var setUserAgent = function (){
        return newUserAgent.trim()
      };

      var actualCode =  '(' + function() {
          'use strict';
          var navigator = window.navigator;
          var modifiedNavigator;
          if (Navigator.prototype.hasOwnProperty('userAgent')) {
            modifiedNavigator = Navigator.prototype;
          } else {
            modifiedNavigator = Object.create(navigator);
            Object.defineProperty(window, 'navigator', {
              value: modifiedNavigator,
              configurable: false,
              enumerable: true,
              writable: false
            });
          }
          Object.defineProperties(modifiedNavigator, {
            userAgent: {
              configurable: true,
              get: function(){ return window.userAgent }
            },
            appVersion: {
              value: navigator.appVersion,
              configurable: false,
              enumerable: true,
              writable: false
            },
            platform: {
              value: navigator.platform,
              configurable: false,
              enumerable: true,
              writable: false
            }
          });
        } + ')();';

      var injectCode = actualCode.replace("window.userAgent", '"' + setUserAgent() + '"');

      var script =  document.createElement('script');
      script.textContent = injectCode;

      (document.head || document.documentElement).appendChild(script);
      script.parentNode.removeChild(script);
    });


// https://stackoverflow.com/questions/1307013/mocking-a-useragent-in-javascript
// setUserAgent('new user agent');
  })();
} catch (e){
  self.port.emit('log', 'error in page script: '+e.message+'\n'+e.stack);
}