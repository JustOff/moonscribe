
// just because I need categories
var logger  = function(ctgrs){
  var me = this;
  me.active = false;

  logger.categories = logger.categories || [];
  var interSet = logger.categories.filter(function(n) {
    return ctgrs.indexOf(n) != -1
  });

  if(interSet.length>0){
    me.active = true;
  }

  if(ctgrs.indexOf("*")>-1){
    me.active = true;
  }

  if(logger.categories.indexOf("*")>-1){
    me.active = true;
  }

  me._ctgrs = ctgrs;
};

logger.prototype.log = function (message, catgr) {
  var me = this;
  if(me.active || (me._ctgrs.indexOf(catgr)>-1)){
    console.log(message);
  }
};


// and some logging levels
logger.prototype.error = (message, e)=>{
  if(!e){
    console.log(message);
  } else {
    console.log(message+'\n =>message:'+e.message+'\n =>stack:]\n'+e.stack);
  }

};


logger.prototype.clone = function (ctgrs) {
  var me = this;
  return new logger([].concat(me._ctgrs).concat(ctgrs));
};

logger.setCategories = (categories)=>{
  logger.categories = categories;
};

logger.prototype.toString = function(){
  var me = this;
  return 'logger: '+me._ctgrs.join(', ');
};



module.exports = logger;