import { json,method,requireAdmin,safeError } from './_shared.js'

// Lista todas as contas, nao so as de role 'client'. O admin tambem usa o
// produto para testar, e antes ele nao conseguia se conceder credito pelo
// painel porque a propria conta ficava fora da lista.
export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const {data,error}=await auth.service.from('profiles')
      .select('id,full_name,email,role,active,credits,credits_plan,credits_extra,created_at')
      .order('role')
      .order('created_at',{ascending:false})
    if(error)throw error
    return json(200,{clients:data||[]})
  }catch(error){return safeError(error)}
}
