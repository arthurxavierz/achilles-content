// Gerador de BR Code estatico (PIX copia e cola), padrao EMV do Banco Central.
// Nao depende de gateway: o QR aponta direto para a chave PIX da Achilles.
// A baixa e manual, pelo painel admin, contra o extrato da conta.

const ascii = (value,max) => (value||'')
  .normalize('NFD').replace(/[̀-ͯ]/g,'')   // tira acento
  .replace(/[^A-Za-z0-9 .-]/g,'')
  .trim().toUpperCase().slice(0,max)

// Cada campo do BR Code e id + tamanho em 2 digitos + valor.
const tlv = (id,value) => `${id}${String(value.length).padStart(2,'0')}${value}`

function crc16(payload){
  let crc=0xFFFF
  for(const byte of Buffer.from(payload,'utf8')){
    crc^=byte<<8
    for(let i=0;i<8;i++) crc = (crc&0x8000) ? ((crc<<1)^0x1021)&0xFFFF : (crc<<1)&0xFFFF
  }
  return crc.toString(16).toUpperCase().padStart(4,'0')
}

// txid aceita ate 25 caracteres alfanumericos. Usamos o id do pagamento
// sem hifens, o que permite conciliar o extrato com a linha da tabela.
export const pixTxid = paymentId => String(paymentId||'').replace(/[^A-Za-z0-9]/g,'').slice(0,25).toUpperCase()

export function buildPixPayload({key,name,city,amountCents,txid}){
  if(!key) throw Object.assign(new Error('Chave PIX não configurada'),{statusCode:503})
  const amount=(Math.max(0,Number(amountCents||0))/100).toFixed(2)
  const merchantAccount = tlv('00','br.gov.bcb.pix') + tlv('01',key.trim())
  const additional = tlv('05', txid || '***')
  const partial =
    tlv('00','01') +
    tlv('26', merchantAccount) +
    tlv('52','0000') +
    tlv('53','986') +
    tlv('54', amount) +
    tlv('58','BR') +
    tlv('59', ascii(name,25) || 'ACHILLES MEDIA') +
    tlv('60', ascii(city,15) || 'CURITIBA') +
    tlv('62', additional) +
    '6304'
  return partial + crc16(partial)
}
