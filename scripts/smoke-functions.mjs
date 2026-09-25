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

const { BRAND_FIELDS } = await import(url.pathToFileURL(path.join(RAIZ,'shared','brand-fields.js')).href)

const PNG_B64=Buffer.from('imagem-falsa').toString('base64')

// Resposta de analise de marca, montada da propria lista de campos.
const ANALISE=JSON.stringify({
  fields:Object.fromEntries(BRAND_FIELDS.map(f=>[f.key,{
    value: f.kind==='color' ? '#B78415' : f.kind==='preset' ? 'gold_tech' : f.kind==='boolean' ? 'true' : `valor de ${f.key}`,
    confidence: f.tier,
    source: 'imagem 1: evidencia',
    needs_user_input: f.tier==='low'
  }])),
  conflicts:[{field:'default_cta',issue:'dois telefones distintos',options:['(34) 3831-3381','(34) 99238-8655']}],
  questions:['A loja trabalha com consorcio?']
})
const chamadas=[]
const gravacoes=[]
let analises=0

// Resposta no formato certo e com conteudo errado: preset que nao existe,
// cor que nao e cor, campo de teto baixo alegando certeza absoluta e texto
// maior que a coluna aceita. E o que a validacao do worker tem de aparar.
const LIXO=JSON.stringify({
  fields:Object.fromEntries(BRAND_FIELDS.map(f=>[f.key,{
    value: f.kind==='color' ? 'dourado escuro' : f.kind==='preset' ? 'preset_inventado' : f.kind==='boolean' ? 'talvez' : 'x'.repeat(f.max+500),
    confidence:'high',
    source:'',
    needs_user_input:false
  }])),
  conflicts:[{field:'campo_que_nao_existe',issue:'i',options:['a']}],
  questions:[]
})

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

const AUTOFILL={
  id:'44444444-4444-4444-4444-444444444444', user_id:GERACAO.user_id,
  status:'queued', images_used:0, result:null, error:null,
  charged_plan:0, charged_extra:0
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
    if(String(init.body||'').includes('brand_brain')){
      analises+=1
      return resp({output_text:analises===1?ANALISE:LIXO,usage:{input_tokens:5200,output_tokens:1800}})
    }
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
  if(t==='brand_autofill_jobs'){
    // Guarda o que o worker grava: HTTP 200 nao prova que o conteudo saiu
    // certo, e o conteudo e o produto desta funcao.
    if(metodo==='PATCH'){ try{ gravacoes.push(JSON.parse(init.body||'{}')) }catch{} }
    return resp(single?AUTOFILL:[AUTOFILL])
  }
  if(t==='pricing') return resp([
    {slug:'copy_carousel',kind:'copy',credits:150,active:true},
    {slug:'brand_analysis',kind:'analysis',credits:50,active:true},
    {slug:'image_standard',kind:'image',credits:100,image_quality:'medium',openai_model:'gpt-image-2.5-flare',active:true},
    {slug:'image_signature',kind:'image',credits:300,image_quality:'high',openai_model:'gpt-image-2.5-sunburst',active:true}])
  if(t==='art_presets') return resp([{slug:'gold_tech',name:'Dourado Tech',summary:'s',prompt_block:'bloco',active:true}])
  if(t==='app_settings') return resp([
    {key:'openai_image_timeout_ms',value:'150000'},{key:'openai_text_timeout_ms',value:'90000'},
    {key:'openai_retries',value:'2'},{key:'feed_image_size',value:'1024x1280'},
    {key:'story_image_size',value:'1024x1792'},{key:'reference_images_max',value:'2'},
    {key:'reference_fidelity',value:'high'},{key:'copy_style_default',value:'estilo'},
    {key:'image_style_default',value:'acabamento'},{key:'feed_safe_crop',value:''},
    {key:'brand_autofill_images',value:'4'}])
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
await roda('worker de analise de marca (4 imagens)','analyze-brand-background.js',evento({job_id:AUTOFILL.id}))
await roda('worker de analise com resposta suja','analyze-brand-background.js',evento({job_id:AUTOFILL.id}))
// --- o que a analise de marca gravou ---
// O worker pode responder 200 e ter escrito lixo. Estas verificacoes sao
// sobre o produto: os vinte e dois campos, o teto de confianca respeitado,
// o preset validado contra a lista e o conflito preservado para o cliente.
const pronto=gravacoes.find(g=>g.status==='ready')
function confere(nome,condicao){
  console.log(`${condicao?'PASSOU':'FALHOU'}  ${nome}`)
  if(!condicao) falhas++
}
console.log('')
if(!pronto){
  falhas++
  console.log('FALHOU  a analise de marca nao gravou resultado pronto')
}else{
  const r=pronto.result||{}
  const campos=r.fields||{}
  confere(`analise devolve os ${BRAND_FIELDS.length} campos`, Object.keys(campos).length===BRAND_FIELDS.length)
  confere('campo low nao se promove a high', BRAND_FIELDS.filter(f=>f.tier==='low').every(f=>campos[f.key]?.confidence==='low'))
  confere('cor virou hex valido', /^#[0-9A-F]{6}$/.test(campos.primary_color?.value||''))
  confere('preset validado contra a lista', campos.preset_slug?.value==='gold_tech')
  confere('texto na arte virou booleano', campos.render_text?.value==='true')
  confere('campo sem valor pede confirmacao', Object.values(campos).every(c=>c.value||c.needs_user_input))
  confere('conflito preservado para o cliente', (r.conflicts||[]).some(c=>c.field==='default_cta'&&c.options.length===2))
  confere('pergunta preservada', (r.questions||[]).length===1)
  confere('cobranca registrada na divisao de saldo', pronto.charged_plan!==undefined&&pronto.charged_extra!==undefined)
}

// A segunda rodada e a da resposta suja.
const sujo=gravacoes.filter(g=>g.status==='ready')[1]
if(!sujo){
  falhas++
  console.log('FALHOU  a rodada com resposta suja nao gravou resultado')
}else{
  const c=sujo.result?.fields||{}
  confere('cor invalida vira vazio e pede confirmacao', c.primary_color?.value===''&&c.primary_color?.needs_user_input===true)
  confere('preset inexistente e recusado', c.preset_slug?.value==='')
  confere('booleano estranho vira false', c.render_text?.value==='false')
  confere('texto longo e cortado no limite da coluna', BRAND_FIELDS.filter(f=>f.kind==='text').every(f=>(c[f.key]?.value||'').length<=f.max))
  confere('teto de confianca do campo prevalece', BRAND_FIELDS.filter(f=>f.tier!=='high').every(f=>c[f.key]?.confidence!=='high'))
  confere('conflito de campo inexistente e descartado', (sujo.result?.conflicts||[]).length===0)
}

console.log(falhas?`\n${falhas} verificacao(oes) com problema.`:'\nTodos os handlers rodaram do inicio ao fim.')
process.exit(falhas?1:0)
