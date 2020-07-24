ifHas = function(parent, selector){
  return !!parent.querySelector(selector);
};

gE = function(selectorOrParent, selector){
  if(selector){
    var el = selectorOrParent.querySelector(selector);
  } else {
    var el = document.querySelector(selectorOrParent);
    selector = selectorOrParent;
  }

  if(!el){
    throw new Error('selector \''+selector+'\' not exists')
  }
  return el;
}

gAll = function(selectorOrParent, selector){
  if(selector){
    var arr = [].slice.call(selectorOrParent.querySelectorAll(selector));
  } else {
    var arr = [].slice.call(document.querySelectorAll(selectorOrParent));
  }

  arr.on = function(ev_name, handler){
    for(var i=0; i< arr.length; i++){
      arr[i].on(ev_name, handler);
    }
  }
  return arr;
}

Element.prototype.on = function(ev_name, handler){
  this.off(ev_name, handler);
  this.addEventListener(ev_name, handler);
  var savedListeners = this['custom'+ev_name];
  if(!savedListeners){
    savedListeners = [];
  }
  savedListeners.push(handler);
  this['custom'+ev_name] = savedListeners;
};

Element.prototype.once = function (ev_name, clbck) {
  var attribName = 'data-costum-once'+ev_name;
  var oldHndlr = this[attribName];
  if(oldHndlr){
    this.removeEventListener(ev_name, oldHndlr);
    delete this[attribName];
  }
  this[attribName] = clbck;
  this.addEventListener(ev_name, clbck);
};

Element.prototype.off = function(ev_name, handler){
  if(handler){
    this.removeEventListener(ev_name, handler);
  } else {

    // remove 'on' listeners array
    var savedListeners = this['custom'+ev_name];
    if(savedListeners){
      for (let item of savedListeners){
        this.removeEventListener(ev_name, item);
      }
    }
    this['custom'+ev_name] = [];

    // remove 'once' listeners array
    var attribName = 'data-costum-once'+ev_name;
    var oldHndlr = this[attribName];
    if(oldHndlr){
      this.removeEventListener(ev_name, oldHndlr);
      delete this[attribName];
    }
  }
};

Element.prototype.clear = function(){
  while (this.firstChild) {
    this.removeChild(this.firstChild);
  }
};

Element.prototype.replaceChilds = function(el){
  this.clear();
  this.appendChild(el);
};

NodeList.prototype.forEach = Array.prototype.forEach;

cE = function(tagName){
  if(!tagName){
    tagName = 'div';
  }
  var el = document.createElement(tagName);
  
  var obj = {
    build: function(){
      return el;
    }
  };
  
  obj.append = function(str){
    var d=document
       ,i
       ,a=d.createElement("div")
       ,b=d.createDocumentFragment();
    a.innerHTML=str;
    while(i=a.firstChild)b.appendChild(i);
    el.appendChild(b);
    return obj;
  };
  
  obj.on = function(ev_name, handler){
    el.addEventListener(ev_name, handler);
    return obj;
  };
  
  obj.child = function(child){
    el.appendChild(child);
    return obj;
  };
  obj.attr = function(key, val){
    el.setAttribute(key, val);
    return obj;
  };
  
  obj.expose = function (target) {
    while (el.childNodes.length > 0) {
      target.appendChild(el.childNodes[0]);
    }
    return target;
  };
  return obj;
};


function fullPath(el){
  var names = [];
  while (el.parentNode){
    if (el.id){
      names.unshift('#'+el.id);
      break;
    }else{
      if (el==el.ownerDocument.documentElement) names.unshift(el.tagName);
      else{
        for (var c=1,e=el;e.previousElementSibling;e=e.previousElementSibling,c++);
        names.unshift(el.tagName+":nth-child("+c+")");
      }
      el=el.parentNode;
    }
  }
  return names.join(" > ");
}


function closest(el, selector) {
  var matchesFn;

  // find vendor prefix
  ['matches','webkitMatchesSelector','mozMatchesSelector','msMatchesSelector','oMatchesSelector'].some(function(fn) {
    if (typeof document.body[fn] == 'function') {
      matchesFn = fn;
      return true;
    }
    return false;
  });

  // traverse parents
  while (el!==null) {
    parent = el.parentElement;
    if (parent!==null && parent[matchesFn](selector)) {
      return parent;
    }
    el = parent;
  }

  return null;
}