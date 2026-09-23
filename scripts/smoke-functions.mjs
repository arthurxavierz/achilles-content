// Teste de fumaca das Netlify Functions.
//
// Executa os handlers de verdade, com Supabase e OpenAI mockados por cima do
// fetch global. Existe por um motivo concreto: um ReferenceError de temporal
// dead zone (const usado antes da linha que o declara) derrubou 100% das
// geracoes de imagem em producao, e nem `node --check` nem o build do Vite
// enxergam isso, porque e erro de execucao, nao de sintaxe.
//
// Rode antes de qualquer deploy que toque em netlify/functions:
//   npm run smoke
//
process.env.SUPABASE_URL='https://mock.supabase.co'
process.env.SUPABASE_SECRET_KEY='mock-service-key'
process.env.SUPABASE_PUBLISHABLE_KEY='mock-anon-key'
process.env.OPENAI_API_KEY='mock-openai-key'
process.env.OPENAI_TEXT_MODEL='gpt-5.1'
process.env.OPENAI_IMAGE_MODEL='gpt-image-2.5-flare'
process.env.INTERNAL_JOB_SECRET='mock-secret'
process.env.APP_URL='https://mock.local'

import path from 'node:path'
import url from 'node:url'
// Raiz do projeto: o script vive em scripts/, entao sobe um nivel.
const RAIZ=process.argv[2]||path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'..')

const PNG_B64=Buffer.from('imagem-falsa').toString('base64')
const chamadas=[]

const GERACAO={
  id:'11111111-1111-1111-1111-111111111111', user_id:'22222222-2222-2222-2222-222222222222',
  format:'carousel', theme:'processos', status:'copy_approved',
  copy_json:{headline:'A',slides:Array.from({length:5},(_,i)=>({title:`T${i+1}`,subtitle:`S${i+1}`})),caption:'c',hashtags:['#a']},
  copy_cost:150, image_cost:500, image_count:5, cost_usd:0,
  preset_slug:'gold_tech', image_quality:'medium', openai_model:'gpt-image-2.5-flare',
  render_text:true, art_direction:null,
  copy_charged_plan:150, copy_charged_extra:0, copy_refunded_at:null
}
const JOB={
  id:'33333333-3333-3333-3333-333333333333', generation_id:GERACAO.id,
  status:'queued', attempts:0, done_count:0, total_count:5, start_index:0,
  charged_plan:500, charged_extra:0, credits_each:100,
  image_quality:'medium', openai_model:'gpt-image-2.5-flare', render_text:true,
  refunded_at:null, generations:GERACAO
}

function tabela(url){
  const m=/\/rest\/v1\/([a-z_]+)/.exec(url)
  return m?m[1]:null
}

globalThis.fetch=async (url,init={})=>{
  const u=String(url)
  const metodo=init.method||'GET'
  chamadas.push(`${metodo} ${u.replace('https://mock.supabase.co','').slice(0,90)}`)
  // supabase-js pode mandar headers como objeto ou como Headers.
  const h=init.headers
  const accept = h instanceof Headers ? (h.get('accept')||'') : (h?.Accept||h?.accept||'')
  const single=/vnd\.pgrst\.object/.test(accept)
  const resp=(corpo,status=200)=>new Response(JSON.stringify(corpo),{status,headers:{'content-type':'application/json'}})

  // --- OpenAI ---
  if(u.includes('api.openai.com/v1/responses')){
    return resp({output_text:JSON.stringify({palette:['ouro'],lighting:'l',texture:'t',composition:'c',mood:'m',recurring_elements:['mascote'],scenes:Array.from({length:5},(_,i)=>({subject:`s${i}`,detail:'d'}))}),usage:{input_tokens:900,output_tokens:400}})
  }
  if(u.includes('api.openai.com/v1/images/')){
    return resp({data:[{b64_json:PNG_B64}],usage:{input_tokens:1200,output_tokens:1300}})
  }
  if(u.includes('api.openai.com/v1/models')) return resp({data:[{id:'gpt-image-2.5-flare'},{id:'gpt-5.1'}]})

  // --- Supabase storage ---
  if(u.includes('/storage/v1/object')){
    if(metodo==='GET') return new Response(new Blob([Buffer.from('ref')]),{status:200})
    return resp({Key:'ok'})
  }

  // --- Supabase RPC ---
  if(u.includes('/rest/v1/rpc/')){
    const fn=u.split('/rpc/')[1].split('?')[0]
    if(fn==='spend_credits') return resp({ok:true,spent_plan:500,spent_extra:0})
    if(fn==='check_signup_quota') return resp({ok:true})
    if(fn==='claim_job_refund'||fn==='claim_copy_refund') return resp(true)
    if(fn==='add_generation_cost') return resp(0.05)
    if(fn==='check_rate_limit') return resp(true)
    return resp(true)
  }

  // --- Supabase REST ---
  const t=tabela(u)
  if(t==='generation_jobs') return resp(single?JOB:[JOB])
  if(t==='generations') return resp(single?GERACAO:[GERACAO])
  if(t==='brand_profiles') return resp(single?{user_id:GERACAO.user_id,brand_name:'Achilles',primary_color:'#b78415',secondary_color:'#111',visual_rules:'r',references_text:'ref',recurring_elements:'mascote',text_style:'caps',typography:'Anton',preset_slug:'gold_tech',copy_rules:'',image_rules:''}:[{}])
  if(t==='pricing') return resp([
    {slug:'copy_carousel',kind:'copy',credits:150,active:true},
    {slug:'image_standard',kind:'image',credits:100,image_quality:'medium',openai_model:'gpt-image-2.5-flare',active:true},
    {slug:'image_signature',kind:'image',credits:300,image_quality:'high',openai_model:'gpt-image-2.5-sunburst',active:true}])
  if(t==='art_presets') return resp([{slug:'gold_tech',name:'Dourado Tech',summary:'s',prompt_block:'bloco',active:true}])
  if(t==='app_settings') return resp([
    {key:'openai_image_timeout_ms',value:'150000'},{key:'openai_text_timeout_ms',value:'90000'},
    {key:'openai_retries',value:'2'},{key:'feed_image_size',value:'1024x1280'},
    {key:'story_image_size',value:'1024x1792'},{key:'reference_images_max',value:'2'},
    {key:'reference_fidelity',value:'high'},{key:'copy_style_default',value:'estilo'},
    {key:'image_style_default',value:'acabamento'},{key:'feed_safe_crop',value:''}])
  if(t==='brand_reference_images') return resp([{storage_path:`${GERACAO.user_id}/a.jpg`}])
  if(t==='generation_images') return resp(single?{storage_path:'p'}:[])
  return resp(single?{}:[])
}

const evento=(corpo,headers={})=>({httpMethod:'POST',headers:{'x-job-secret':'mock-secret',...headers},body:JSON.stringify(corpo)})

let falhas=0
async function roda(nome,arquivo,ev){
  chamadas.length=0
  try{
    const mod=await import(url.pathToFileURL(path.join(RAIZ,'netlify','functions',arquivo)).href)
    const out=await mod.handler(ev)
    const status=out?.statusCode
    const corpo=(()=>{ try{ return JSON.parse(out?.body||'{}') }catch{ return {} } })()
    const ok = status>=200 && status<300
    console.log(`${ok?'PASSOU':'FALHOU'}  ${nome}  -> HTTP ${status}${corpo.error?'  '+corpo.error:''}`)
    if(!ok){ falhas++; console.log('   chamadas:',chamadas.slice(0,6).join(' | ')) }
    return corpo
  }catch(error){
    falhas++
    console.log(`ERRO    ${nome}  -> ${error?.name}: ${error?.message}`)
    console.log('   ',String(error?.stack||'').split('\n')[1]?.trim())
    return null
  }
}

console.log('--- executando handlers com Supabase e OpenAI mockados ---')
await roda('worker de imagem (5 artes, com referencia e texto)','generate-images-background.js',evento({job_id:JOB.id}))
await roda('worker de copy','generate-copy-background.js',evento({generation_id:GERACAO.id}))
console.log(falhas?`\n${falhas} handler(s) com problema.`:'\nTodos os handlers rodaram do inicio ao fim.')
process.exit(falhas?1:0)
