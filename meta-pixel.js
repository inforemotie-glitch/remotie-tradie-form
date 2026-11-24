/*
  Meta Pixel base code for dataset 1757698228867001, loaded from the <head> of index.html.
  It is a file, not an inline script, because the Content-Security-Policy in vercel.json blocks inline scripts.
  init runs exactly once. The PageView carries an event ID that app.js also posts to /api/meta-capi, so Meta keeps
  one copy. Keep this script above app.js in index.html: both are deferred, so they run in that order.
*/
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');

(function () {
  var c = window.crypto;
  var hex = function () { return Math.random().toString(16).slice(2, 10); };
  var id = 'pv_' + (c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now() + '_' + hex() + hex());
  window.__REMOTIE_PV_EVENT_ID__ = id;
  fbq('init', '1757698228867001');
  fbq('track', 'PageView', {}, { eventID: id });
})();
