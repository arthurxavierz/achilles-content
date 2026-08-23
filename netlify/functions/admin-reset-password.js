import crypto from 'node:crypto'
import { audit,body,json,method,requireAdmin,safeError,text } from './_shared.js'

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%'

// Rejeicao por amostragem. Um simples byte % tamanho enviesaria os primeiros
// caracteres do alfabeto, o que enfraquece a senha gerada.
function makePassword(length=20){
  const limit=Math.floor(256/ALPHABET.length)*ALPHABET.length
  let out=''
  while(out.length<length){
    for(const byte of crypto.randomBytes(length*2)){
      if(byte>=limit)continue
      out+=ALPHABET[byte%ALPHABET.length]
      if(out.length===length)break
    }
  }
  return out
}

export async function handler(event){
  try{
    method(event)
    const auth=await requireAdmin(event)
    const input=await body(event)
    const id=text(input.user_id,80,true)
    const password=makePassword()
    const {error}=await auth.service.auth.admin.updateUserById(id,{password})
    if(error)throw error
    await audit(auth.service,auth.user.id,id,'password_reset',{})
    return json(200,{password})
  }catch(error){ return safeError(error) }
}
