import crypto from 'node:crypto'
import { service } from './_shared.js'
import { applyApprovedPayment } from './_billing.js'

function validSignature(event,dataId){
  const secret=process.env.MP_WEBHOOK_SECRET
  if(!secret)return false
  const header=event.headers['x-signature']||''
  const requestId=event.headers['x-request-id']||''
  const parts=Object.fromEntries(header.split(',').map(x=>x.trim().split('=')))
  if(!parts.ts||!parts.v1)return false
  const manifest=`id:${dataId};request-id:${requestId};ts:${parts.ts};`
  const digest=crypto.createHmac('sha256',secret).update(manifest).digest('hex')
  try{ return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(parts.v1)) }catch{ return false }
}

export async function handler(event){
  const svc=service()
  let payload={}
  try{ payload=JSON.parse(event.body||'{}') }catch{}
  const dataId=String(payload?.data?.id||event.queryStringParameters?.['data.id']||'')

  await svc.from('webhook_events').insert({provider:'mercadopago',provider_event_id:String(payload?.id||''),request_id:event.headers['x-request-id']||null,payload})
  if(!dataId||!validSignature(event,dataId))return{statusCode:401,body:'invalid signature'}

  try{
    const res=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,{headers:{authorization:`Bearer ${process.env.MP_ACCESS_TOKEN}`}})
    if(!res.ok)return{statusCode:200,body:'ignored'}
    const mp=await res.json()
    if(mp.status!=='approved'||!mp.external_reference)return{statusCode:200,body:'ignored'}

    const {data:payment}=await svc.from('payments').select('*').eq('id',mp.external_reference).single()
    if(!payment||payment.status==='approved')return{statusCode:200,body:'ok'}
    if(Math.round(Number(mp.transaction_amount)*100)!==payment.amount_cents)return{statusCode:200,body:'amount mismatch'}

    // Atualizacao condicional: apenas uma notificacao consegue sair de 'pending'.
    const {data:claimed}=await svc.from('payments')
      .update({status:'approved',mp_payment_id:String(mp.id),raw_payload:mp,paid_at:new Date().toISOString()})
      .eq('id',payment.id).eq('status','pending').select('*').maybeSingle()
    if(!claimed)return{statusCode:200,body:'ok'}

    await applyApprovedPayment(svc,claimed)
    return{statusCode:200,body:'ok'}
  }catch(error){
    console.error(error)
    return{statusCode:200,body:'received'}
  }
}
