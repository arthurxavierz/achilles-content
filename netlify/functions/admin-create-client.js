import { audit,body,integer,json,method,requireAdmin,safeError,text } from './_shared.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const fullName=text(input.full_name,160,true)
    const email=text(input.email,320,true).toLowerCase()
    const password=text(input.password,200,true)
    const planSlug=text(input.plan_slug,80,true)
    const extra=integer(input.initial_credits??0,0,100000)
    if(password.length<10)throw Object.assign(new Error('A senha precisa ter ao menos 10 caracteres'),{statusCode:400})

    const {data:plan}=await auth.service.from('plans').select('*').eq('slug',planSlug).eq('active',true).single()
    if(!plan)throw Object.assign(new Error('Plano não encontrado'),{statusCode:404})

    const {data:created,error}=await auth.service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}})
    if(error)throw Object.assign(new Error(error.message||'Não foi possível criar o usuário'),{statusCode:400})
    const userId=created.user.id

    // Cliente criado pelo painel e cobrado fora da plataforma, entao renova sozinho.
    // Se o cliente pagar pelo checkout, o webhook troca renewal_mode para 'payment'.
    await auth.service.from('subscriptions').insert({user_id:userId,plan_id:plan.id,status:'active',renewal_mode:'manual',last_renewed_at:new Date().toISOString()})
    await auth.service.rpc('set_plan_credits',{p_user_id:userId,p_amount:plan.monthly_credits,p_reason:'Créditos iniciais do plano'})
    if(extra>0){
      await auth.service.rpc('grant_credits',{p_user_id:userId,p_amount:extra,p_reason:'Créditos extras iniciais',p_admin_id:auth.user.id,p_bucket:'extra',p_kind:'admin_grant'})
    }

    await audit(auth.service,auth.user.id,userId,'client_created',{plan_slug:planSlug,initial_extra:extra})
    return json(201,{client:{id:userId,email,full_name:fullName}})
  }catch(error){ return safeError(error) }
}
