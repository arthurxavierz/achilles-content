import crypto from 'node:crypto'
import { body,json,loadSettings,method,safeError,service,text } from './_shared.js'
import { FREE_SIGNUP_CREDITS } from '../../shared/pricing.js'

// Nunca guardamos IP em claro. O hash serve so para contar quantas contas
// sairam da mesma rede, e o segredo do job entra como sal para o valor
// nao ser reversivel por tentativa.
const hash = value => crypto.createHash('sha256')
  .update(`${process.env.INTERNAL_JOB_SECRET||'achilles'}:${value}`).digest('hex').slice(0,40)

const clientIp = event =>
  (event.headers['x-nf-client-connection-ip']
   || (event.headers['x-forwarded-for']||'').split(',')[0]
   || '0.0.0.0').trim()

export async function handler(event){
  try{
    method(event)
    const svc=service()
    const settings=await loadSettings(svc)
    if(String(settings.signup_open ?? 'true')!=='true'){
      throw Object.assign(new Error('Os cadastros estão temporariamente fechados. Fale com a Achilles.'),{statusCode:403})
    }

    const input=await body(event)
    const email=text(input.email,320,true).toLowerCase()
    const password=text(input.password,200,true)
    const fullName=text(input.full_name,160,true)
    const deviceId=text(input.device_id,120,true)

    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('E-mail inválido'),{statusCode:400})
    if(password.length<8) throw Object.assign(new Error('A senha precisa ter ao menos 8 caracteres'),{statusCode:400})

    const deviceHash=hash(deviceId)
    const networkHash=hash(`${clientIp(event)}|${event.headers['user-agent']||''}`)

    // A contagem mora no banco para ser atomica: duas abas abertas ao mesmo
    // tempo nao conseguem furar o limite.
    const {data:quota,error:qErr}=await svc.rpc('check_signup_quota',{p_device_id:deviceHash,p_network_hash:networkHash})
    if(qErr)throw qErr
    if(!quota?.ok){
      const msg = quota?.reason==='device'
        ? 'Este dispositivo já criou o número máximo de contas gratuitas. Entre com uma conta existente ou fale com a Achilles.'
        : 'Muitos cadastros vindos desta rede. Tente novamente mais tarde ou fale com a Achilles.'
      throw Object.assign(new Error(msg),{statusCode:429})
    }

    // email_confirm true de proposito: o atrito fica no pagamento do plano,
    // nao na porta de entrada. O admin valida dinheiro, nao existencia.
    const {data:created,error}=await svc.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{full_name:fullName}
    })
    if(error){
      const already=/already|exists|registered/i.test(error.message||'')
      throw Object.assign(new Error(already?'Já existe uma conta com este e-mail. Tente entrar.':'Não foi possível criar a conta.'),{statusCode:already?409:400})
    }

    await svc.from('signup_attempts').insert({
      device_id:deviceHash, network_hash:networkHash, user_id:created.user.id, email
    })

    return json(201,{ok:true,credits:FREE_SIGNUP_CREDITS,email})
  }catch(error){return safeError(error)}
}
