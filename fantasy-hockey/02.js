(function(){
  'use strict';
  // Legacy compatibility bridge for browsers that cached the previous Hockey AI Pro loader.
  // The current release is config.js -> data.js -> icons.js -> app.js.
  if (window.__HAP_COMPAT_BRIDGE__) return;
  window.__HAP_COMPAT_BRIDGE__ = true;

  var base = new URL('./', document.currentScript ? document.currentScript.src : location.href);
  var ver = '6104';

  function present(selector){
    return !!document.querySelector(selector);
  }

  function load(src){
    return new Promise(function(resolve, reject){
      if (present('script[src*="' + src.split('?')[0].replace(/\\/g,'/') + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = new URL(src, base).href;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error('Failed to load ' + s.src)); };
      document.head.appendChild(s);
    });
  }

  (async function(){
    if (!window.FANTASY_CONFIG) await load('./config.js?v=' + ver);
    if (!window.HOCKEY_DEMO) await load('./assets/data.js?v=' + ver);
    if (!window.Icon) await load('./assets/icons.js?v=' + ver);
    if (!present('script[src*="/assets/app.js"]')) await load('./assets/app.js?v=' + ver);
  })().catch(function(err){
    console.error('Hockey AI Pro compatibility bridge failed:', err);
  });
})();