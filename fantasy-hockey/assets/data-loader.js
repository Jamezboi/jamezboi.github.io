(async()=>{
  const base='./assets/demo-runtime/', names=['01.js','02.js','03.js','04.js'];
  try{const parts=await Promise.all(names.map(n=>fetch(base+n,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`${n}: HTTP ${r.status}`);return r.text();})));(0,eval)(parts.join(''));window.dispatchEvent(new Event('fantasy-data-ready'));}
  catch(err){document.body.innerHTML='<div style="padding:32px;font-family:system-ui;color:white;background:#080c14"><h2>Hockey AI Pro</h2><p>Demo data could not be loaded.</p><pre>'+String(err.message||err)+'</pre></div>';}
})();