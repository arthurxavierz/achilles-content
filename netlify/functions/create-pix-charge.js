import QRCode from 'qrcode'
import { body,json,method,rateLimit,requireUser,safeError,text } from './_shared.js'
import { buildPixPayload,pixTxid } from './_pix.js'

const CHARGE_TTL_HOURS = 24

export async function handler(event){
  try{
    method(event)
    const auth=await requireUser(event)
    await rateLimit(auth.service,auth.user.id,'create-pix-charge',6)

    const input=await body(event)
    const kind=input.kind
    const slug=text(input.slug,80,true)
    if(!['plan','credit_pack'].includes(kind))throw Object.assign(new Error('Tipo de compra inválido'),{statusCode:400})

    const table=kind==='plan'?'plans':'credit_packs'
    const {data:item}=await auth.service.from(table).select('*').eq('slug',slug).eq('active',true).single()
    if(!item)throw Object.assign(new Error('Item não encontrado'),{statusCode:404})

    // Uma cobranca aberta por item. Reabrir a tela nao deve gerar um segundo QR.
    const {data:open}=await auth.service.from('payments').select('*')
      .eq('user_id',auth.user.id).eq('status','pending').eq('provider','pix_manual')
      .eq(kind==='plan'?'plan_id':'pack_id',item.id)
      .gt('expires_at',new Date().toISOString()).maybeSingle()

    const payment = open || await (async () => {
      const {data,error}=await auth.service.from('payments').insert({
        user_id:auth.user.id,kind,provider:'pix_manual',
        amount_cents:item.price_cents,
        credits:kind==='plan'?item.monthly_credits:item.credits,
        status:'pending',
        expires_at:new Date(Date.now()+CHARGE_TTL_HOURS*3600000).toISOString(),
        [kind==='plan'?'plan_id':'pack_id']:item.id
      }).select('*').single()
      if(error)throw error
      return data
    })()

    const txid=pixTxid(payment.id)
    const payload=payment.pix_payload || buildPixPayload({
      key:process.env.PIX_KEY,
      name:process.env.PIX_MERCHANT_NAME,
      city:process.env.PIX_MERCHANT_CITY,
      amountCents:payment.amount_cents,
      txid
    })
    if(!payment.pix_payload){
      await auth.service.from('payments').update({pix_payload:payload,pix_txid:txid}).eq('id',payment.id)
    }

    const qr=await QRCode.toDataURL(payload,{errorCorrectionLevel:'M',margin:1,width:520,color:{dark:'#0B0B0B',light:'#FFFFFF'}})

    return json(200,{
      payment_id:payment.id,
      txid,
      item:{name:item.name,credits:kind==='plan'?item.monthly_credits:item.credits},
      amount_cents:payment.amount_cents,
      expires_at:payment.expires_at,
      pix_payload:payload,
      qr_data_url:qr,
      instructions:'Pague pelo app do seu banco e envie o comprovante. A liberação dos créditos é confirmada pela Achilles.'
    })
  }catch(error){return safeError(error)}
}
