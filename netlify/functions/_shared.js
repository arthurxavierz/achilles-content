import { createClient } from '@supabase/supabase-js'

export const json = (statusCode, body) => ({ statusCode, headers: { 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY' }, body: JSON.stringify(body) })
export const env = name => { const value=process.env[name]; if(!value) throw new Error(`Missing server env: ${name}`); return value }
export const service = () => createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false}})
export const pub = token => createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),{global:{headers:token?{Authorization:`Bearer ${token}`}:{}} ,auth:{persistSession:false,autoRefreshToken:false}})
export const bearer = event => { const raw=event.headers.authorization||event.headers.Authorization||''; return raw.startsWith('Bearer ')?raw.slice(7):null }
export async function requireUser(event){const token=bearer(event);if(!token)throw Object.assign(new Error('Não autorizado'),{statusCode:401});const client=pub(token);const {data,error}=await client.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Não autorizado'),{statusCode:401});const svc=service();const {data:profile}=await svc.from('profiles').select('id,role,active,credits_plan,credits_extra,credits').eq('id',data.user.id).single();if(!profile?.active)throw Object.assign(new Error('Conta desativada'),{statusCode:403});return{user:data.user,profile,client,service:svc,token}}
export async function requireAdmin(event){const auth=await requireUser(event);if(auth.profile.role!=='admin')throw Object.assign(new Error('Acesso negado'),{statusCode:403});return auth}
export async function body(event){try{return event.body?JSON.parse(event.body):{}}catch{throw Object.assign(new Error('JSON inválido'),{statusCode:400})}}
export function method(event,allowed=['POST']){if(!allowed.includes(event.httpMethod))throw Object.assign(new Error('Método não permitido'),{statusCode:405})}
export const text = (value,max=2000,required=false) => { if(value==null||value===''){if(required)throw Object.assign(new Error('Campo obrigatório'),{statusCode:400});return''} if(typeof value!=='string'||value.length>max)throw Object.assign(new Error('Entrada inválida'),{statusCode:400});return value.trim() }
export const integer=(value,min=0,max=100000)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Object.assign(new Error('Número inválido'),{statusCode:400});return n}
export async function rateLimit(svc,userId,action,limit=10){const {data,error}=await svc.rpc('check_rate_limit',{p_user_id:userId,p_action:action,p_limit:limit});if(error)throw error;if(!data)throw Object.assign(new Error('Muitas tentativas. Tente novamente em instantes.'),{statusCode:429})}
export function safeError(error){console.error(error);return json(error?.statusCode||500,{error:error?.statusCode?error.message:'Não foi possível concluir a operação'})}
export async function audit(svc,adminId,targetId,action,details={}){await svc.from('admin_audit_log').insert({admin_id:adminId,target_user_id:targetId,action,details})}

// ---------------------------------------------------------------------
// Catalogo de precos. A tabela public.pricing e a fonte de verdade.
// Cache curto em memoria: o container da function e reaproveitado entre
// invocacoes, entao sem cache cada geracao faria duas queries a mais.
// ---------------------------------------------------------------------
const CATALOG_TTL_MS = 60_000
let catalogCache = null

export async function loadCatalog(svc){
  if(catalogCache && Date.now()-catalogCache.at < CATALOG_TTL_MS) return catalogCache.value
  const [{data:pricing,error:pErr},{data:presets,error:aErr}]=await Promise.all([
    svc.from('pricing').select('*').eq('active',true).order('sort_order'),
    svc.from('art_presets').select('*').eq('active',true).order('sort_order')
  ])
  if(pErr||aErr) throw pErr||aErr
  const value={
    pricing:Object.fromEntries((pricing||[]).map(row=>[row.slug,row])),
    presets:presets||[],
    presetsBySlug:Object.fromEntries((presets||[]).map(row=>[row.slug,row]))
  }
  catalogCache={at:Date.now(),value}
  return value
}

export function priceOf(catalog,slug){
  const item=catalog.pricing[slug]
  if(!item) throw Object.assign(new Error('Tabela de preços indisponível. Fale com a Achilles.'),{statusCode:503})
  return item
}

export const FORMATS = Object.freeze(['post','story','carousel'])
export const copySlug = format => format==='carousel' ? 'copy_carousel' : format==='story' ? 'copy_story' : 'copy_post'
export const imageSlug = quality => quality==='signature' ? 'image_signature' : 'image_standard'
export const imageCount = format => format==='carousel' ? 5 : 1
export const imageSize = format => format==='story' ? '1024x1536' : '1024x1024'

// ---------------------------------------------------------------------
// Custo real em dolar. A OpenAI devolve usage em tokens; convertemos com
// o preco por milhao. Sem isso a margem do painel seria um chute.
// Ajuste por env se a OpenAI reajustar a tabela.
// ---------------------------------------------------------------------
const price = (name,fallback) => Number(process.env[name] ?? fallback)
export const USD_PER_M = {
  textInput: () => price('OPENAI_TEXT_INPUT_USD_PER_M', 1.25),
  textOutput: () => price('OPENAI_TEXT_OUTPUT_USD_PER_M', 10),
  imageInput: () => price('OPENAI_IMAGE_INPUT_USD_PER_M', 10),
  imageOutput: () => price('OPENAI_IMAGE_OUTPUT_USD_PER_M', 40)
}

// Fallback quando a resposta nao traz usage. Tokens de saida por imagem.
const IMAGE_OUTPUT_TOKENS = { '1024x1024':{low:272,medium:1056,high:4160}, '1024x1536':{low:408,medium:1584,high:6240} }

export function textCostUsd(usage){
  const input=Number(usage?.input_tokens||0), output=Number(usage?.output_tokens||0)
  return (input*USD_PER_M.textInput() + output*USD_PER_M.textOutput())/1_000_000
}

export function imageCostUsd(usage,size,quality){
  const output=Number(usage?.output_tokens||0) || (IMAGE_OUTPUT_TOKENS[size]?.[quality] ?? IMAGE_OUTPUT_TOKENS['1024x1024'].medium)
  const input=Number(usage?.input_tokens||0)
  return (input*USD_PER_M.imageInput() + output*USD_PER_M.imageOutput())/1_000_000
}

// Trava global de gasto. Protege contra loop de geracao mesmo com credito
// disponivel. O teto da chave na OpenAI e a segunda camada, fora daqui.
export async function assertSpendCeiling(svc){
  const ceiling=Number(process.env.MONTHLY_API_CEILING_USD||0)
  if(!ceiling) return
  const from=new Date(); from.setUTCDate(1); from.setUTCHours(0,0,0,0)
  const {data}=await svc.from('generations').select('cost_usd').gte('created_at',from.toISOString())
  const spent=(data||[]).reduce((sum,row)=>sum+Number(row.cost_usd||0),0)
  if(spent>=ceiling) throw Object.assign(new Error('Geração temporariamente suspensa. Fale com a Achilles.'),{statusCode:503})
}

// ---------------------------------------------------------------------
// Despacho e estorno dos jobs de imagem.
// Ficam aqui porque tres caminhos precisam deles: o dispatcher, a
// regeneracao e o cron que recolhe job travado.
// ---------------------------------------------------------------------
export async function dispatchJob(jobId){
  const target=`${process.env.APP_URL}/.netlify/functions/generate-images-background`
  await fetch(target,{method:'POST',headers:{'content-type':'application/json','x-job-secret':process.env.INTERNAL_JOB_SECRET||''},body:JSON.stringify({job_id:jobId})})
}

// Estorna somente as pecas que nao chegaram ao cliente. Imagem entregue ja
// custou dinheiro na OpenAI e nao volta para o saldo.
export async function refundUnproducedImages(svc,job,generation,reason){
  const {data:current}=await svc.from('generation_jobs').select('done_count').eq('id',job.id).maybeSingle()
  const delivered=Number(current?.done_count ?? job.done_count ?? 0)
  const start=Number(job.start_index||0)
  const total=Number(job.total_count||0)
  const window=Math.max(1,total-start)
  const pending=Math.max(0,total-delivered)
  const ratio=Math.min(1,pending/window)
  const plan=Math.round(Number(job.charged_plan||0)*ratio)
  const extra=Math.round(Number(job.charged_extra||0)*ratio)
  if(plan+extra<=0) return {refunded:0}
  await svc.rpc('refund_credits',{p_user_id:generation.user_id,p_plan:plan,p_extra:extra,p_reason:reason,p_reference_id:generation.id})
  return {refunded:plan+extra,plan,extra}
}
