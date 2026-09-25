(async()=>{
  const start=()=>{window.removeEventListener('fantasy-data-ready',start);load();};
  if(!window.FANTASY_DEMO_DATA)window.addEventListener('fantasy-data-ready',start);else load();
  async function load(){
    const base='./assets/runtime/';
    const names=['01.js','02.js','03.js','04.js','05.js','06.js'];
    try{
      const parts=await Promise.all(names.map(n=>fetch(base+n,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`${n}: HTTP ${r.status}`);return r.text();})));
      const blob=new Blob([parts.join('')],{type:'text/javascript'});
      const script=document.createElement('script');
      script.src=URL.createObjectURL(blob);
      script.onload=()=>URL.revokeObjectURL(script.src);
      script.onerror=()=>{document.body.innerHTML='<div style="padding:32px;font-family:system-ui;color:white;background:#080c14">Hockey AI Pro failed to load its runtime bundle.</div>';};
      document.head.appendChild(script);
    }catch(err){document.body.innerHTML='<div style="padding:32px;font-family:system-ui;color:white;background:#080c14"><h2>Hockey AI Pro</h2><p>Runtime assets could not be loaded.</p><pre>'+String(err.message||err)+'</pre></div>';}
  }
})();