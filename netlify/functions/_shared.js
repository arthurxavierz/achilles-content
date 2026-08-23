import { createClient } from '@supabase/supabase-js'
import { FORMAT_PRICING } from '../../shared/pricing.js'

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

// Preco vem de shared/pricing.js. Nao duplicar valores aqui.
export function copyCost(format){return FORMAT_PRICING[format]?.copyCredits ?? 1}
export function imageCount(format){return FORMAT_PRICING[format]?.imageCount ?? 1}
export const IMAGE_CREDITS_EACH = FORMAT_PRICING.post.imageCreditsEach
export function imageCost(format,count){const item=FORMAT_PRICING[format];if(!item)return 0;return item.imageCreditsEach*(count??item.imageCount)}

// Confere o segredo interno usado entre Functions. Comparacao em tempo constante.
export function isInternalCall(event){
  const secret=process.env.INTERNAL_JOB_SECRET||''
  const sent=event.headers['x-job-secret']||event.headers['X-Job-Secret']||''
  if(!secret||!sent||secret.length!==sent.length)return false
  let diff=0
  for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^sent.charCodeAt(i)
  return diff===0
}

// Estorna somente as imagens que o job nao chegou a produzir.
// Devolve primeiro ao balde de avulsos, espelhando a ordem do debito
// (spend_credits consome plano primeiro).
export async function refundUnproducedImages(svc,job,generation,reason){
  const produced=Math.max(0,(job.done_count||0)-(job.start_index||0))
  const contracted=Math.max(0,(job.total_count||0)-(job.start_index||0))
  const pending=Math.max(0,contracted-produced)
  if(pending<=0)return 0
  const amount=pending*IMAGE_CREDITS_EACH
  const extra=Math.min(job.charged_extra||0,amount)
  const plan=Math.min(job.charged_plan||0,amount-extra)
  if(plan+extra<=0)return 0
  await svc.rpc('refund_credits',{p_user_id:generation.user_id,p_plan:plan,p_extra:extra,p_reason:reason,p_reference_id:generation.id})
  return plan+extra
}

// Dispara a Background Function. Uma falha aqui nao pode derrubar a resposta ao
// cliente: o job ja existe e o cron-maintenance reenfileira o que ficar parado.
export async function dispatchJob(jobId){
  try{
    const response=await fetch(`${env('APP_URL')}/.netlify/functions/generate-images-background`,{
      method:'POST',
      headers:{'content-type':'application/json','x-job-secret':process.env.INTERNAL_JOB_SECRET||''},
      body:JSON.stringify({job_id:jobId})
    })
    return response.ok||response.status===202
  }catch(error){
    console.error('dispatchJob falhou',jobId,error)
    return false
  }
}
