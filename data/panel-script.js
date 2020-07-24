var WL_WRONG_SITE          = 'E';
var WL_REMOVED             = '0';
var WL_ADDED               = '1';
var WL_ADDED_PLUS_NO_PROXY = '2';


window.addEventListener('load', function () {

  try{
    Ps.initialize(gE('#scrolledLocations'));
    Ps.initialize(gE('#recent_links_list'));
    Ps.initialize(gE('#whiteList_links'));
  } catch (e){
    self.port.emit('log', 'error with scrollbar: '+ e.message);
  }

  function isObject(someObject){
    return Object.prototype.toString.call( someObject ) === '[object Object]';
  }

    // hasClass addClass removeClass toggleClass
try{
    var links_proto = ['http:', 'https:', 'mailbox:', 'imap:', 'news:', 'snews:'];
    // holder for section's options
    var opts = new function(){
      document.sectionData = [];
      this.isSet = function(){
        return document.sectionData.length>0;
      };
      this.set = function(arg){
        document.sectionData[0] = arg;
      };
      this.reset = function(){
        document.sectionData = [];
      };
      this.get = function(){
        return document.sectionData[0]; // 
      }
    };
    
    self.port.on('out_of_traffic', function () {
        //show button upgrade, turnoff app userStatus
        gE('#updateButton').removeAttribute('hidden');
        gE('.userStatus').setAttribute('hidden', "");
    });

    self.port.on('banned', function () {
        //show turnoff app
        gE('.userStatus').textContent = "Banned";
    });

    self.port.on('upgraded', function () {
        gE('.userStatus').setAttribute('hidden', "");
        gE('#updateButton').setAttribute('hidden', "");
        //hide remaining traffic
    });

    self.port.on('downgraded', function () {
        gE('.userStatus').removeAttribute('hidden');
    });

    self.port.on('info_changed', function (data) {
        gE('.userStatus').textContent = data;
    });
    
    self.port.on('url_changed', function(url){
      gE('#whiteList').removeAttribute("data-tooltip");
      // gE('#whiteList_btn').removeAttribute("data-tooltip");
      gE('.secureLink').value = url;
      gE('#whiteList').setAttribute('data-site', url);
      gE('#whiteListBtnText').textContent = 'Whitelist it';
      self.port.emit('check_site_whitelisted', url);
    });

    var switchSection = function(section, options){

      if(!options){
        opts.reset();
      } else {
        opts.set(options);
      }

      gAll('body > div').forEach(function(el){
        el.addClass('hidden');
      });
      gE('body div#' + section).removeClass('hidden');
      // self.port.emit('log', 'switch section to '+section+' called');
      gE('body').removeClass('wait');

      switch(section){
        case 'main':
          self.port.emit('locations_update_current_ui');
          self.port.emit('locations_update_ui');
          self.port.emit('update_online_state');
          var url = gE('#whiteList').getAttribute('data-site');
          self.port.emit('check_site_whitelisted', url);
          break;
        case 'slinks':
          gE('#slink_passw').value = '';
          gE('#slink_descr').value = '';
          break;
        case 'locations':
          break;
        case 'recent_links':
          self.port.emit('recent_links_update_ui');
          break;
        case 'white_list':
          if(opts.isSet()){
            var state = opts.get().state;
            var layout = opts.get().layout;
            if(!state){
              state = WL_WRONG_SITE;
            }
            var isCurWL = opts.get().isCurWL;
            if(!isCurWL){
              isCurWL = WL_WRONG_SITE;
            }


            var isOpenedFromOptions = (layout === 'manage');
            if(isOpenedFromOptions){
              gE('body').removeAttribute('wl_mess');
            }
            gE('#white_list .navBack').once('click', function () {
              if(isOpenedFromOptions){
                switchSection('menu');
              } else {
                switchSection('main');
              }
            });


            var isInTheList = (isCurWL === WL_ADDED) || (isCurWL === WL_ADDED_PLUS_NO_PROXY);
            var isNOTInTheList = (isCurWL === WL_REMOVED);
            var isWrongSite = (isCurWL === WL_WRONG_SITE);

            var mess = opts.get().mess;
            self.port.emit('log', 'message is:'+mess+', state is:'+state);
            if(!mess){
              var messFromNode = gE('body').getAttribute('wl_mess');
              if(!!messFromNode){
                mess = messFromNode;
              }
            }

            if(isInTheList) {
              gE('#whiteList_label').style.fontSize='17px';
              if(mess && mess == 'added'){
                gE('body').setAttribute('wl_mess', mess);
                gE('#whiteList_label').textContent = 'This Site is Whitelisted';
              } else {
                gE('#whiteList_label').textContent = 'Resume using Proxy for this site?';
              }
              gE('#whiteListBtns').addClass('hidden');
              gE('#deleteBtns').removeClass('hidden');
              // btn = 'Remove Site from Whitelist';
            } else if(isNOTInTheList) {
              gE('#whiteList_label').style.fontSize='17px';
              if(mess && mess == 'removed'){
                gE('body').setAttribute('wl_mess', mess);
                gE('#whiteList_label').textContent = 'Site removed from Whitelist';
              } else {
                gE('#whiteList_label').textContent = 'Stop using Proxy for this Site?';
              }
              gE('#whiteListBtns').removeClass('hidden');
              gE('#deleteBtns').addClass('hidden');
            } else if(isWrongSite){
              gE('#whiteList_label').style.fontSize='15px';
              gE('#whiteList_label').textContent = 'Current site is invalid, cannon be whitelisted';
              gE('#whiteListBtns').addClass('hidden');
              gE('#deleteBtns').addClass('hidden');
            }

          }
          break;
        case 'signup':
        case 'login':
          gAll('.mainfraim:not(.ignore-grey)').forEach(function (el) {
            el.removeClass('disabled');
          });

          if(opts.isSet()){
            var ops = opts.get();
            if(ops.message){
              gE('#login-body-login-errormess').textContent = ops.message;
              gE('#login-body-signup-errormess').textContent = ops.message;
            } else {
              gE('#login-body-login-errormess').textContent = '';
              gE('#login-body-signup-errormess').textContent = '';
            }
            if(ops.keep){
              break;
            }

            //do not clean forms
          }

          gE('#login-body-login-name').value = '';
          gE('#login-body-login-passw').value = '';


          gE('#login-body-signup-name').value = '';
          gE('#login-body-signup-passw').value = '';
          gE('#login-body-signup-email').value = '';
          break;
        case 'loader':
          if(opts.isSet()){
            gE('#loading_message').textContent=opts.get();
          }
          break;
        case 'blocking_options':
          self.port.emit('update_blocking_options_status');
          break;
      }

    };
    self.port.on('switch_section', switchSection);
  var updateUI = function(){
      var active_el = gE('body > div:not(.hidden)');
      if(!active_el.hasClass('preserve-on-close')){
        switchSection('main');
      }
    };
    self.port.on('update_ui', updateUI);

    gE('#login-header-signup').on('click', function () {
      if(document.register_via_site_only){
        self.port.emit("signup_via_site");
      } else {
        switchSection('signup');
        gE('#login-body-login-errormess').textContent = '';
        gE('#login-body-login-name').value = '';
        gE('#login-body-login-passw').value = '';
      }

    });

    gE('#login-header-login').on('click', function () {
        switchSection('login');

        gE('#login-body-signup-errormess').textContent = '';
        gE('#login-body-signup-name').value = '';
        gE('#login-body-signup-passw').value = '';
        gE('#login-body-signup-email').value = '';
    });

    
    // menu activation
    gAll('.toMain').on('click', function(){
      switchSection('main');
    });

    gAll('.toMenu').on('click', function(){
      switchSection('menu');
    });
    
    gE('.main-menu').on('click', function(){
      switchSection('menu');
    });
    
    gE('#countrySelector').on('click', function(){
      self.port.emit('click_on_main_location');
    });

    gE('#copyLink').on('click', function(){
      var url = ''+gE('#copyLinkForm input.secureLink').value;

      if(url) {
        var copyLink = gE('#copyLink');
        var parser = document.createElement('a');
        parser.href = url;
        if(links_proto.includes(parser.protocol)){
          self.port.emit('slinks_create', url);
          copyLink.textContent = 'Saving...';
          copyLink.removeAttribute("data-tooltip");
        }
        else {
          copyLink.setAttribute('data-tooltip',
              "Cannot make a Secure.link from this page");
        }
      }
      return false;
    });

    self.port.on('slinks_ready', function(data){
      gE('#copyLink').textContent = 'COPY SECURE.LINK';
      if(data!==false){
        switchSection('slinks', data);
      }
    });
    
    gE('#applySwitcher').on('click', function(){
      if ( gE('#currentMode').textContent === 'External App' ) {
        gE('#currentMode').addClass('visibletooltip');
        setTimeout(function() {
          gE('#currentMode').removeClass('visibletooltip')
        }, 2000)
        return;
      }
      if ( gE('#currentMode').textContent === 'Double Hop' ) {
        self.port.emit('updateCurrentModeLabels', 'switchOffDoubleHop');
        return;
      }
      self.port.emit('switch_proxy');
    });
    
    self.port.on('proxy_status', function(status){
      let active = gE('.mainfraim:not(.hidden)');
      if((active.id == 'login') || (active.id == 'signup')){
        gAll('.mainfraim:not(.ignore-grey)').forEach(function (el) {
          el.removeClass('disabled');
        });
        return;
      }
      if(status){
        gE('#applySwitcher').src='../assets/power_button_on_2x.png';
        gAll('.mainfraim:not(.ignore-grey)').forEach(function (el) {
          el.removeClass('disabled');
        });
        gE('#status').textContent = 'Connected'.toUpperCase();
      } else {
        gE('#applySwitcher').src='../assets/power_button_off_2x.png';
        gAll('.mainfraim:not(.ignore-grey)').forEach(function (el) {
          el.addClass('disabled');
        });
        gE('#status').textContent = 'Disconnected'.toUpperCase();
      }
    });
    
    gE('#slink_save').on('click', function(e){
      if(opts.isSet()){
        try{
          var linkData = opts.get();
          var passw     = gE('#slink_passw').value;
          var descr     = gE('#slink_descr').value;
          var isInstall = gE('#slinks_force_install').checked;
          self.port.emit('slinks_update', { 
            id: linkData.secure_link_display_id,
            passw:passw, descr:descr, isInstall:isInstall 
          });
          opts.reset();
        } catch(e){
          alert('error here: '+e)
        }
      } else {
        // impossible situation
        switchSection('main'); // anyway
      }
    });
    

    self.port.on('locations_update_done', function(data, isPremium, current){
      gE('#locations_list').textContent = '';

      data.forEach(function(elem){

        var json = ['div', {'class': 'item'}];

        if(document.flags){
          if(document.flags.indexOf(elem.country_code+'.png')>-1){
            json.push/* first child*/(['img', {
              'src':'../assets/flags/48/'+elem.country_code+'.png',
              "width": "24",
              "height": "24",
              "class": "locationFlag"
            }]);
          }
        }
        json.push(['span', {'class':"vertical-center"}, ''+elem.name]);


          var iconContainer = ['div', {'class': 'iconContainer'}];

        if(!isPremium) {
          if (elem.premium_only === 1 && elem.status === 1) {
            iconContainer.push(['span', {'class':'star'}, ['img', {
              'src': '../assets/star_2x.png',
              'height':'21',
              'width':'21'}]]
            );
          }
        }

        if(current != false && current.code != 'Automatic'){
          if((elem.short_name == current.code) && (elem.name == current.name )){
            iconContainer.push(['span', {'class':'star'}, ['img', {'src':'../assets/checkmark_2x.png', 'height':'13', 'width':'17'}]]);
              // so far we have selected country
              // lets remove checkmark from "Automatic" if present
              if(ifHas(gE('#automatic_icon_area'), '.star')){
                gE('#automatic_icon_area').textContent = '';
              }
            }
          }

        if(elem.status === 2){
          iconContainer.push(['span', {'class':'star'}, ['img', {
            'src':'../assets/update_white_icon_2x.png',
            'height':'17',
            'width':'17'}]]
          );
        }

        json[1]/* root elem attr*/ = Object.assign(json[1], {
          "id":"location_"+elem.short_name,
          "data-name": elem.name,
          "data-short_name": elem.short_name,
          "data-country_code": elem.country_code,
          "data-status": elem.status,
          "data-premium_only": elem.premium_only
        });

          if(elem.dns_hostname){
            json[1]["data-dns_hostname"]= elem.dns_hostname;
          }

          var rawNode = jsonToDOM(json, document, {});

          if(elem.status === 2 || (!isPremium && elem.premium_only === 1)){
            rawNode.addClass('inactiveLocation');
          } else {
            if((isPremium) || (!isPremium && elem.premium_only !== 1)){
              rawNode.on('click', function(){
                self.port.emit('locations_select', elem.short_name, elem.name, elem.country_code);
                self.port.emit('locations_update_ui');
              });
            }
          }

        rawNode.appendChild(jsonToDOM(iconContainer, document, {}));
        gE('#locations_list').appendChild(rawNode);
      });

      if(current.code == 'Automatic'){
        // this item is not re-rendering, so avoid adding icon once again if already set
        if(!ifHas(gE('#automatic_icon_area'), '.star')){
          gE('#automatic_icon_area').appendChild(jsonToDOM(['span', {'class':'star'},
            ['img', {'src':'../assets/checkmark_2x.png', 'height':'13', 'width':'17'}]], document, {}
          ));
        }
      }
      Ps.update(gE('#scrolledLocations'));
    });

    gE('#cruise_controll').on('click', function () {
      self.port.emit('locations_select', 'Automatic', 'Automatic');
      self.port.emit('locations_update_ui');
    });



  self.port.on('locations_update_current_ui_done', function(currentLocation){
    var locationToDisplay;
    if(isObject(currentLocation)){
      locationToDisplay = currentLocation;
    } else {
      locationToDisplay = {};
      locationToDisplay.name = currentLocation;
    }

    var resJson = [];
    if(locationToDisplay.country_code){
      if(document.flags){
        if(document.flags.indexOf(locationToDisplay.country_code+'.png')>-1){
          resJson.push(['img', {
            'id':"main-location-image",
            'src':'./../assets/flags/48/'+locationToDisplay.country_code+'.png',
            'height':"48",
            'width':"48"
          }]);
        }
      }
    }

    var locationName = locationToDisplay.name === 'Automatic' ? 'Cruise Control (Automatic)' : locationToDisplay.name;
    resJson.push([null, {}, locationName]);

    var el = gE('.currentConnection');
    el.clear();
    el.appendChild(jsonToDOM(resJson, document, {}));

    self.port.emit('updateCurrentModeLabels', currentLocation);

  });

  self.port.on('updateCurrentModeLabelsDone', function (data) {
    gE('#currentMode').textContent = data[0];
    gE('#currentMode').setAttribute('data-tooltip', data[1]);
  });

  gE('#recent_links_menu').on('click', function(){
     switchSection('recent_links');
  });

  if(ifHas(document.body, '#blocking_options_menu')){
    gE('#blocking_options_menu').on('click', function(){
      switchSection('blocking_options');
    });
  }

  self.port.on('recent_links_update_ui_done', function(links){
    self.port.emit('log', 'update UI start, data:'+JSON.stringify(links));
    gE('#recent_links_list').clear();
    var todayList = [];
    var yesterdayList = [];


    var todayDate = new Date(); todayDate.setHours(0); todayDate.setMinutes(0); todayDate.setSeconds(0); todayDate.setMilliseconds(0);
    var today = todayDate.getTime()/1000;
    var yesterday = today - (24 * 60 * 60);
    var older = [];
    for(var i = 0; i < links.length; i++){
      if(links[i].created_timestamp>=today){
        todayList.push(links[i]);
      } else if(links[i].created_timestamp>=yesterday){
        yesterdayList.push(links[i]);
      } else /* links[i].date < beforeYesterday*/{
        older.push(links[i]);
      }
    }

    var headerTemplate = ['div', {'class':'sectionTitle item'}];

    var generateSlinkElementTemplate = function({title, link, linkClass, linkImgDivs, id}){
      return ['div', {'class':"item", id: 'recent_link_'+id}, [

        ['div', {'class':"listItemSubRow"}, [
          'span', {'class':"dimmed_white slink_title"}, title
        ],[
          'span', {'class':"right copyEl", 'data-link':link}, 'Copy'
        ]],

        ['div', {'class':"listItemSubRow"}, [
          'span', {class:"dimmed_white "+linkClass}, linkImgDivs, [null, {}, link]
        ], [
          'span', {class:"right removeEl", 'data-id':id}, 'Remove'
        ]]

      ]];
    };

    /*
<div id="recent_link_{id}" class="item">

  <div class="listItemSubRow">
    <span class="dimmed_white slink_title">{title}</span>
    <span class="right copyEl" data-link="{link}">Copy</span>
  </div>

  <div class="listItemSubRow">
    <span  class="dimmed_white {linkClass}">{linkImgDivs}{link}</span>
    <span class="right removeEl" data-id="{id}">Remove</span>
  </div>

</div>
      */

    var appendSection = function(title, list){
      if(list.length>0){
        var headerTree = JSON.parse(JSON.stringify(headerTemplate));
        headerTree.push(title);

        var jsonSection = [headerTree]

        for(var i=0; i<list.length; i++){
          var element = list[i];

          //noinspection JSUnresolvedVariable
          var tmplOptions = {
            id: element.secure_link_display_id,
            title: (!!element.page_title)?element.page_title:'Page Title Unknown',
            link: element.secure_url
          };

          var linkClass = '';
          var linkImgDivs = [];
          var iconCount = 0;
          if(element.encrypted == '1'){
            linkImgDivs.push(['div', {'class':'slinkEncrypted'}]);
            iconCount++;
          }
          if(element.force_install == '1'){
            linkImgDivs.push(['div', {'class':'slinkForce'}]);
            iconCount++;
          }
          if(iconCount == 1){
            linkClass += ' slinkOneIcon';
          } else if(iconCount == 2){
            linkClass += ' slinkTwoIcon';
          }

          tmplOptions.linkClass = linkClass;
          tmplOptions.linkImgDivs = linkImgDivs;

          var jsonEl = generateSlinkElementTemplate(tmplOptions);
          jsonSection.push(jsonEl);
        }
        // self.port.emit('log', 'actualNode: '+JSON.stringify(jsonSection));
        var actualNode = jsonToDOM(jsonSection, document, {});
        gE('#recent_links_list').appendChild(actualNode);
      }
    };

    appendSection('Today', todayList);
    appendSection('Yesterday', yesterdayList);
    appendSection('Older', older);


    var normalizeItem = function(el){
      if(ifHas(el, '.copyEl')){
        gE(el, '.copyEl').textContent = 'Copy';
      }

      if(ifHas(el, '.removeEl')){
        gE(el, '.removeEl').textContent = 'Remove';
      }

      var cssSelector = fullPath(el);

      jss.set(cssSelector +' .slink_title', {
        width: '275px'
      });
    };

    gAll(gE('#recent_links_list'), '.copyEl').on('click', function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      var link = target.getAttribute('data-link');
      self.port.emit('recent_links_copy_link', link);

      gAll('#recent_links_list > div').forEach(function(el){
        normalizeItem(el);
      });

      // ff 35+
      var parent = target.closest('.item');
      var parentSelector = fullPath(parent);
      jss.set(parentSelector+' .slink_title', {
        width: '250px'
      });


      target.textContent = "Copied!";
    });

    gAll('#recent_links_list .removeEl').on('click', function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      var id = target.getAttribute('data-id');

      gAll('#recent_links_list > div').forEach(function(el){
        normalizeItem(el);
      });


      // ff 35+
      var parent = target.closest('.item');
      var parentSelector = fullPath(parent);


      //
      gE(parentSelector+' .copyEl').textContent="Are you sure?";
      jss.set(parentSelector+' .slink_title', {
        width: '225px'
      });
      //
      gE(parentSelector+' .removeEl').replaceChilds(jsonToDOM([
        ['span', {'class':"yesButton"}, 'Yes'],
        ['span', {'class':"noButton"}, 'No']
      ], document, {}));

      gE(parentSelector+' .yesButton').on('click', function(){
        self.port.emit('recent_links_remove_link', id);
      });

      gE(parentSelector+' .noButton').on('click', function(){
        gAll('#recent_links_list > div').forEach(function(el){
          normalizeItem(el);
        });
      });
    });

    Ps.update(gE('#recent_links_list'));

  });


    (function () {

        //login
        var submitFunc = function () {
            var name = gE('#login-body-login-name').value;
            var passw = gE('#login-body-login-passw').value;

            var loginErrorMsg =  gE('#login-body-login-errormess');
            if(!name.trim() || !passw) {
              loginErrorMsg.removeAttribute("hidden");
              loginErrorMsg.replaceChilds(jsonToDOM([null,{}, "This login appears to be invalid, try again"], document, {}));
              setTimeout(function(){
                loginErrorMsg.setAttribute("hidden", "true");
              }, 2500);
              return false;
            }

            self.port.emit('action_user_login', {name: name.trim(), passw: passw});
        };

        gE('#login-body-login-subm').on("click", function (e) {
            e.preventDefault();
            submitFunc();
        });

        gE('#login-body-login-passw').on("keydown", function (e) {
            if (e.keyCode == 13) {
                e.preventDefault();
                submitFunc();
                return false;
            }
            return true;
        });

        self.port.on('login_error', function(param){
          var loginErrorMsg =  gE('#login-body-login-errormess');
          loginErrorMsg.replaceChilds(jsonToDOM([null, {}, "Please fill in all required fields"], document, {}));
          if(param.mode == 'login'){
            switchSection('login', {keep: true});
          }
          loginErrorMsg.replaceChilds(jsonToDOM([null,{},param.mess], document, {}));
          loginErrorMsg.removeAttribute("hidden");
          setTimeout(function(){
            loginErrorMsg.setAttribute("hidden", "true");
          }, 2500);
        });
        self.port.on('signup_error', function(message){
          var signupErrorMsg =  gE('#login-body-signup-errormess');
          signupErrorMsg.replaceChilds(jsonToDOM([null,{},"Please fill in all required fields"], document, {}));
          if(message) signupErrorMsg.replaceChilds(jsonToDOM([null,{},message], document, {}));
          signupErrorMsg.removeAttribute("hidden");
          setTimeout(function(){
            signupErrorMsg.setAttribute("hidden", "true");
          }, 2500);
        });



        var onClickUpgrade = function (){
          self.port.emit('open_new_url', lnkData.LNK_UPGRD);
        };

        self.port.on('main_traffic_left', function(traffic){
          gE('#payment_status_wrapper').once('click', onClickUpgrade);
          gE('#payment_status_wrapper').className = 'userStatus';
          gE('#payment_status').replaceChilds(jsonToDOM([null,{},traffic+' GB Left'], document, {}));
          jss.set('#payment_status', {color: 'white'});
          gE('#set-statusContainer').removeAttribute("data-tooltip");
          gE('#countrySelector').removeAttribute("data-tooltip");
        });

        self.port.on('main_traffic_ends', function(){
          gE('#payment_status').replaceChilds(jsonToDOM(['div',{
            'class':"userStatusUpgradeText"
          },
            ['img', {'src':"../assets/star_2x.png", 'class':"userStatusImg", 'style':"right: 58px"}],
            [null,{},'Upgrade']
          ], document, {}));


          gE('#payment_status_wrapper').on('click', onClickUpgrade);
          gE('#payment_status_wrapper').className = 'userStatusUpgrade upgrade';
          gE('#set-statusContainer').setAttribute("data-tooltip", "You exceeded your free usage for this month. Please upgrade.");
          gE('#countrySelector').setAttribute("data-tooltip",
            "You exceeded your free usage for this month. Please upgrade.");
        });

        self.port.on('main_traffic_banned', function(){
          gE('#payment_status_wrapper').off('click', onClickUpgrade);
          gE('#payment_status_wrapper').className = 'userStatusUpgrade upgrade';
          gE('#payment_status').replaceChilds(jsonToDOM(['div', {'class':"userStatusUpgradeText"}, ['img', {src:"../assets/star_2x.png", 'class':"userStatusImg", 'style':"right: 58px"}], [null, {}, 'Banned']], document, {}));
          gE('#set-statusContainer').removeAttribute("data-tooltip");
          gE('#countrySelector').removeAttribute("data-tooltip");
        });

        self.port.on('main_traffic_premium', function(){
          gE('#payment_status_wrapper').off('click', onClickUpgrade);
          gE('#payment_status_wrapper').className = 'userStatusPro';
          gE('#payment_status').replaceChilds(jsonToDOM(['div', {'class':"userStatusProText"}, ['img', {'src':"../assets/star_2x.png", 'class':"userStatusImg", 'style':"right: 22px"}], [null, {}, 'Pro ']], document, {}));
          gE('#set-statusContainer').removeAttribute("data-tooltip");
          gE('#countrySelector').removeAttribute("data-tooltip");
        });

        self.port.on('main_traffic_days', function(days){
          var status_text = days !== 1 ? days + ' Days Left' : '1 Day Left';
          gE('#payment_status_wrapper').off('click', onClickUpgrade);
          gE('#payment_status_wrapper').className = 'userStatusDaysLeft';
          gE('#payment_status').replaceChilds(jsonToDOM(['div', {'class':"userStatusDaysLeftText"}, ['img', {'src':"../assets/star_2x.png", 'class':"userStatusImg"}], [null, {}, status_text]], document, {}));
          gE('#set-statusContainer').removeAttribute("data-tooltip");
          gE('#countrySelector').removeAttribute("data-tooltip");
        });


        //signUp
        gE('#login-body-signup-subm').on("click", function (e) {
            e.preventDefault();
            var name = gE('#login-body-signup-name').value;
            var passw = gE('#login-body-signup-passw').value;
            var email =  gE('#login-body-signup-email').value;
            var emailRegExp = /\S+@\S+\.\S+/;
            var loginRegExp = /^[a-z0-9]+$/i;

            var registrationData = {
                name: name.trim(),
                passw: passw
            };

            var signupErrorMsg =  gE('#login-body-signup-errormess');

            if(registrationData.name.length < 3){
              signupErrorMsg.removeAttribute("hidden");
              signupErrorMsg.textContent = "Username must be at least 3 characters";
              setTimeout(function(){
                signupErrorMsg.setAttribute("hidden", "true");
              }, 2500);
              return false;
            }
            if(registrationData.passw.length < 7){
              signupErrorMsg.removeAttribute("hidden");
              signupErrorMsg.textContent = "Password must be at least 7 characters";
              setTimeout(function(){
                signupErrorMsg.setAttribute("hidden", "true");
              }, 2500);
              return false;
            }
            if(registrationData.name && !loginRegExp.test(registrationData.name)){
              signupErrorMsg.removeAttribute("hidden");
              signupErrorMsg.textContent = "Login does not appear to be valid";
              setTimeout(function(){
                signupErrorMsg.setAttribute("hidden", "true");
              }, 2500);
              return false;
            }

            if(email)
              registrationData.email = email.trim();

            if(registrationData.email && !emailRegExp.test(registrationData.email)){
              signupErrorMsg.removeAttribute("hidden");
              signupErrorMsg.textContent = "Email does not appear to be valid";
              setTimeout(function(){
                signupErrorMsg.setAttribute("hidden", "true");
              }, 2500);
              return false;
          }


          if(registrationData.passw === "" || registrationData.name === ""){
            signupErrorMsg.removeAttribute("hidden");
            signupErrorMsg.textContent = "Please fill in all required fields";
            setTimeout(function(){
              signupErrorMsg.setAttribute("hidden", "true");
            }, 2500);
            return false;
          }
            self.port.emit('action_user_signUp', registrationData);
        });

        //logout
        gE('#logout').on("click", function (e) {
            e.preventDefault();
            self.port.emit('action_user_logout');
        });

        gE('#authErrLogout').on("click", function (e) {
          e.preventDefault();
          self.port.emit('action_user_logout');
        });
    })();


    self.port.on('proxy_became_broken', function(){
      switchSection('lose_control');
    });

    gE('#overrideProxyBack').on('click', function(){
      self.port.emit('might_return_to_main');
      self.port.emit('override_broken_proxy');
    });

    self.port.on('link_data', function (lnkData) {
      gE('#my_acc_link').on('click', function () {
        self.port.emit('open_new_url', lnkData.LNK_MY_ACC);
      });
      gE('#help_menu').on('click', function(){
        self.port.emit('open_new_url', lnkData.LNK_HLP);
      });
      gE('#menu_sl_help').on('click', function(){
        self.port.emit('open_new_url', lnkData.LNK_SEC_LINK_HLP);
      });

      gE('#upgrade_menu').on('click', function(){
        self.port.emit('open_new_url', lnkData.LNK_UPGRD);
      });

      gE('#login-footer-passw').on('click', function(){
        self.port.emit('open_new_url', lnkData.LNK_PSSWRD_FRGT);
      });

    });

    self.port.on('switchUARotator', function (val) {
      var el = gE('#splitPersonality');
      el.__ignoreListener = true;
      el.checked = val;
      delete el.__ignoreListener;
    });

    gE('#splitPersonality').on('change', function () {
      var el = gE('#splitPersonality');
      self.port.emit('log', 'splitPersonality switched:'+el.checked+', __ignoreListener:'+el.__ignoreListener);
      if(el.__ignoreListener){
        return;
      }
      self.port.emit('switchUARotatorByUser', el.checked);
    });

    gE('#manualRotation').on('click', function (e) {
      var data = {
        platform: navigator.platform,
        url: gE('#whiteList').getAttribute('data-site')
      };
      self.port.emit('switchUAManually', data);
      var iconEl = gE('#rotateManualIcon img');
      iconEl.style.transition =  'opacity 0.5s linear';
      iconEl.style.opacity = 0;
      setTimeout(function () {
        iconEl.src =  '/data/css/checkmark2x.png';
        iconEl.style.transition =  '';
        iconEl.style.opacity = 1;
      }, 500);

      setTimeout(function () {
        iconEl.style.transition =  'opacity 0.5s linear';
        iconEl.style.opacity = 0;
      }, 2500);

      setTimeout(function () {
        iconEl.src =  '/data/css/refresh2x.png';
        iconEl.style.transition =  '';
        iconEl.style.opacity = 1;
      }, 3000);

    });

    var switch_masking = function (isMasked) {
      return;
      // ff find a way to deal with concurrent race even here
       let newDisplay = isMasked?'block':'none';
       gAll('#blocking-options .masking').forEach(function (el) {
         el.style.display = newDisplay;
       });
    };

    self.port.on('update_blocking_options_status_done', function ({antitrackerState, antisocialState, easyState}) {
      gE('#untraceable').checked = !!antitrackerState;
      gE('#anti-social').checked = !!antisocialState;
      gE('#anti-ads').checked = !!easyState;

      setTimeout(()=>{
        switch_masking(false);
      }, 0);
    });

    // const switchSocialEventName = 'fanboySwitch';
    // const switchTrackerEventName = 'antitrackerSwitch';

    gE('#untraceable').on('change', function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      var newState = target.checked;
      setTimeout(()=>{
        switch_masking(true);
      }, 0);
      self.port.emit('antitrackerSwitch', newState);
    });

    gE('#anti-social').on('change', function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      var newState = target.checked;
      setTimeout(()=>{
        switch_masking(true);
      }, 0);
      self.port.emit('fanboySwitch', newState);
    });

    gE('#anti-ads').on('change', function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      var newState = target.checked;
      setTimeout(()=>{
        switch_masking(true);
      }, 0);
      self.port.emit('easySwitch', newState);
    });

  var addCurrentToAdsAndProxy = function () {
    gE('body').addClass('wait');
    var currentSite = gE('#whiteList').getAttribute('data-site');
    gE('#white_list').setAttribute('mod', 'main');
    self.port.emit('change_site_whitelisted', {
      toBeAdded:true,
      site: currentSite,
      isOpenedFromOptions: false,
      currentSite:currentSite,
      isWithProxy: true,
      mess: 'added'
    });
  };

  gE('#whiteListProxyBtn').once('click', addCurrentToAdsAndProxy);

  gE('#deleteBtn').once('click', function () {
    var currentSite = gE('#whiteList').getAttribute('data-site');

    var isOpenedFromOptions = false;
    var mod = gE('#white_list').getAttribute('mod');
    if(mod && mod === 'manage') {
      isOpenedFromOptions = true;
    }

    self.port.emit('change_site_whitelisted', {
      toBeAdded:false,
      site: currentSite,
      isOpenedFromOptions: isOpenedFromOptions,
      currentSite:currentSite,
      mess: 'removed'
    });
  });

   gE('#manage_whitelist').on('click', function(){
     gE('#white_list').setAttribute('mod', 'manage');
     var state = gE('#whiteList').getAttribute('data-state');

     switchSection('white_list', { isCurWL : state, layout: 'manage'});
   });

  //noinspection SpellCheckingInspection
  self.port.on('check_site_whitelisted_done', function (whitelisted) {
    if(!whitelisted){
      self.port.emit('log', 'error here, please check calling function: '+(new Error()).stack);
      return;
    }
    self.port.emit('log', 'data to show on UI: '+JSON.stringify(whitelisted));

    if(whitelisted.valid){
      if(whitelisted.isWhiteListed){
        // TODO: WL_ADDED_PLUS_NO_PROXY
        gE('#whiteList').setAttribute('data-state', WL_ADDED);
      } else {
        gE('#whiteList').setAttribute('data-state', WL_REMOVED);
      }
    } else {
      gE('#whiteList').setAttribute('data-state', WL_WRONG_SITE);
    }

    if(whitelisted.valid){
      if(whitelisted.isWhiteListed){
        //noinspection SpellCheckingInspection
        self.port.emit('log', 'check_site_whitelisted_done is whitelisted, showing that');
        gE('#whiteListBtnText').textContent = 'Remove from whitelist';
        gE('#whiteListBtnText').once('click', function () {
          var currentSite  = gE('#whiteList').getAttribute('data-site');
          gE('body').addClass('wait');
          self.port.emit('change_site_whitelisted', {
            toBeAdded:false,
            site: currentSite,
            isOpenedFromOptions: false,
            currentSite: currentSite,
            mess: 'removed'
          });
        });
        //noinspection SpellCheckingInspection
        gE('#whiteListIndicator-mainScreen').textContent = 'This site is whitelisted';
      } else {

        //noinspection SpellCheckingInspection
        gE('#whiteListBtnText').textContent = 'Whitelist it';
        gE('#whiteListIndicator-mainScreen').textContent = 'Having Issues with this site?';

        var currentSite  = gE('#whiteList').getAttribute('data-site');
        var isSiteValidClientCheck = false;
        if(currentSite) {
          var parser = document.createElement('a');
          parser.href = currentSite;
          if (links_proto.includes(parser.protocol)) {
            isSiteValidClientCheck = true;
          }
        }
        if(isSiteValidClientCheck){
          gE('#whiteListBtnText').once('click', addCurrentToAdsAndProxy);
        } else {
          // client side checking
          gE('#whiteListBtnText').off('click');
          gE('#whiteList').setAttribute("data-tooltip", "Cannot add empty page to whitelist");
        }
      }

    } else {
      // bg script checking

      gE('#whiteList').setAttribute("data-tooltip", "Cannot add empty page to whitelist");
    }

  });

  gE('#restart_now').on('click', function () {
    self.port.emit('restart_now');
  });

  function renderWhiteList(whiteList){
    if(whiteList){
      gE('#whiteList_links').textContent = '';
      whiteList.forEach(function(wlItem){
        var item = wlItem.url;

        var whiteListItem = document.createElement('div');
        var itemName = document.createElement('span');
        var removeBtn = document.createElement('span');
        whiteListItem.className = 'whiteList-item';
        itemName.className = 'whiteList-item-name';
        itemName.textContent = item;
        removeBtn.id = item;
        removeBtn.textContent = "Remove";
        removeBtn.className = 'whiteList-item-remove';
        removeBtn.on('click', function(){
          gE('body').addClass('wait');
          var currentSite  = gE('#whiteList').getAttribute('data-site');
          var mod = gE('#white_list').getAttribute('mod');
          var isOpenedFromOptions = (mod === 'manage');
          self.port.emit('change_site_whitelisted', {toBeAdded: false, site: item, isOpenedFromOptions:isOpenedFromOptions, currentSite: currentSite});
        });
        whiteListItem.appendChild(itemName);
        whiteListItem.appendChild(removeBtn);
        gE('#whiteList_links').appendChild(whiteListItem);
      });
      Ps.update(gE('#whiteList_links'));
    }
  }

   self.port.emit('whitelist_init');
   self.port.on('whitelist_init_done', function(whitelist){
     renderWhiteList(whitelist);
   });

   self.port.on('change_site_whitelisted_done', function (res, whiteList) {
     gE('body').removeClass('wait');
     var state;
     // console.log("res on change_site_whitelisted_done: "+JSON.stringify(res));
     if(res.valid){
       if(res.isWhiteListed){
         state = WL_ADDED;
       } else {
         state = WL_REMOVED;
       }
       if(res.isCurr){
         gE('#whiteList').setAttribute('data-state', state);
       }

       var layout = 'main';
       var mod = gE('#white_list').getAttribute('mod');
       if(mod && mod === 'manage') {
         layout = 'manage'
       }
       var params = { state : state, layout: layout };
       if(res.mess){
         params.mess = res.mess
       }
       params.isCurWL = res.isCurWL;
       switchSection('white_list', params );
     }
     renderWhiteList(whiteList);
   });

    self.port.emit('init_popup');

    self.port.on('flags', function(flags){
      document.flags = flags;
    });

    self.port.on('setup_register_via_site_only', function (register_via_site_only) {
      document.register_via_site_only = register_via_site_only;
    });

    self.port.on('disable_PAC_due_to_1267000_bug', function () {
      gE('#set-statusContainer').setAttribute('data-tooltip', "proxy can not be enabled exactly in this version of firefox due to firefox bug that will cause browser crash");
    });


} catch(e){
  alert(e);
}
}, false);
