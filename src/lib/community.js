// O acervo do carrossel da comunidade.
//
// São artes reais, geradas na plataforma, servidas como arquivo estático em
// public/comunidade/. Ficam aqui e não no banco de propósito: a landing é
// pública e carrega antes de qualquer autenticação, e as gerações dos
// clientes moram em storage privado, que não pode ser aberto para a
// internet só para alimentar uma vitrine.
//
// Para trocar o acervo: ponha o arquivo em public/comunidade/ e ajuste a
// linha correspondente. O carrossel usa quantas linhas existirem aqui, e o
// cartão que não encontrar o arquivo aparece como placa da marca, em vez de
// ícone de imagem quebrada.
//
// `tag` é opcional e some quando vazia. Só preencha com o que for verdade
// sobre a peça: formato, segmento, preset. Nada de nome de cliente que não
// tenha autorizado aparecer.

export const COMMUNITY_ART = [
  { src: '/comunidade/01.png', tag: '' },
  { src: '/comunidade/02.png', tag: '' },
  { src: '/comunidade/03.png', tag: '' },
  { src: '/comunidade/04.png', tag: '' },
  { src: '/comunidade/05.png', tag: '' },
  { src: '/comunidade/06.png', tag: '' },
  { src: '/comunidade/07.png', tag: '' },
  { src: '/comunidade/08.png', tag: '' },
  { src: '/comunidade/09.png', tag: '' },
  { src: '/comunidade/10.png', tag: '' }
]
