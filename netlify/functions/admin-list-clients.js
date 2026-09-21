import { json,method,requireAdmin,safeError } from './_shared.js'

// Todas as contas, com saldo, plano, entregas e custo real, numa consulta
// so. Antes o painel listava profiles cru e nao mostrava consumo, e ainda
// filtrava por role='client', o que escondia a conta do proprio admin.
export async function handler(event){
  try{
    method(event,['GET'])
    const auth=await requireAdmin(event)
    const {data,error}=await auth.service.from('admin_accounts')
      .select('*').order('created_at',{ascending:false}).limit(1000)

    // Se a V11 ainda nao rodou, a view nao existe: cai no caminho antigo
    // em vez de quebrar o painel inteiro.
    if(error){
      const {data:fallback,error:fErr}=await auth.service.from('profiles')
        .select('id,full_name,email,role,active,credits,credits_plan,credits_extra,created_at')
        .order('created_at',{ascending:false})
      if(fErr)throw fErr
      return json(200,{clients:fallback||[],degraded:true})
    }

    const rows=data||[]
    return json(200,{
      clients:rows,
      totals:{
        accounts:rows.length,
        active:rows.filter(r=>r.active).length,
        credits:rows.reduce((s,r)=>s+(r.credits||0),0),
        generations:rows.reduce((s,r)=>s+Number(r.generations||0),0),
        cost_usd:Number(rows.reduce((s,r)=>s+Number(r.cost_usd||0),0).toFixed(4))
      }
    })
  }catch(error){return safeError(error)}
}
