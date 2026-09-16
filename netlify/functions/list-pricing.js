import { json,loadCatalog,safeError,service } from './_shared.js'

// Catalogo publico: quanto custa cada operacao e quais presets existem.
// A landing e o estudio leem daqui, entao reajuste de preco nao exige deploy.
export async function handler(event){
  try{
    if(event.httpMethod!=='GET')return json(405,{error:'Método não permitido'})
    const svc=service()
    const catalog=await loadCatalog(svc)
    return{
      statusCode:200,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff'},
      body:JSON.stringify({
        pricing:catalog.pricing,
        presets:catalog.presets.map(({slug,name,summary})=>({slug,name,summary}))
      })
    }
  }catch(error){return safeError(error)}
}
