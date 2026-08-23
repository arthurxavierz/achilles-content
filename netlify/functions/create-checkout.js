import { body,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'create-checkout',5)
    const input=await body(event)
    const kind=input.kind
    const slug=text(input.slug,80,true)
    if(!['plan','credit_pack'].includes(kind))throw Object.assign(new Error('Tipo de compra inválido'),{statusCode:400})

    const table=kind==='plan'?'plans':'credit_packs'
    const {data:item}=await auth.service.from(table).select('*').eq('slug',slug).eq('active',true).single()
    if(!item)throw Object.assign(new Error('Item não encontrado'),{statusCode:404})

    const amount=item.price_cents
    const credits=kind==='plan'?item.monthly_credits:item.credits
    const payload={user_id:auth.user.id,kind,amount_cents:amount,credits,status:'pending',[kind==='plan'?'plan_id':'pack_id']:item.id}
    const {data:payment,error}=await auth.service.from('payments').insert(payload).select('*').single()
    if(error)throw error

    const appUrl=process.env.APP_URL
    const pref=await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',
      headers:{authorization:`Bearer ${process.env.MP_ACCESS_TOKEN}`,'content-type':'application/json','x-idempotency-key':payment.id},
      body:JSON.stringify({
        items:[{title:`Achilles Content | ${item.name}`,quantity:1,unit_price:amount/100,currency_id:'BRL'}],
        external_reference:payment.id,
        payer:{email:auth.user.email},
        back_urls:{
          success:`${appUrl}/app/planos?pagamento=sucesso`,
          pending:`${appUrl}/app/planos?pagamento=pendente`,
          failure:`${appUrl}/app/planos?pagamento=falha`
        },
        auto_return:'approved',
        notification_url:`${appUrl}/.netlify/functions/mp-webhook`,
        statement_descriptor:'ACHILLESCONTENT'
      })
    })
    if(!pref.ok){
      // Sem preferencia criada o registro pendente vira lixo na fila do admin.
      await auth.service.from('payments').update({status:'rejected'}).eq('id',payment.id)
      throw new Error(`Mercado Pago ${pref.status}`)
    }
    const data=await pref.json()
    await auth.service.from('payments').update({mp_preference_id:data.id}).eq('id',payment.id)
    return json(200,{checkout_url:data.init_point||data.sandbox_init_point,payment_id:payment.id})
  }catch(error){ return safeError(error) }
}
