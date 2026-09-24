// O acervo do carrossel da vitrine.
//
// São arquivos estáticos em public/comunidade/, servidos como qualquer outro
// asset. Ficam fora do banco de propósito: a landing é pública e carrega
// antes de qualquer autenticação, e as gerações dos clientes moram em storage
// privado, que não vai ser aberto para a internet só para alimentar uma
// vitrine.
//
// Para trocar o acervo: ponha o arquivo em public/comunidade/ e ajuste a
// linha correspondente. O carrossel usa quantas linhas existirem aqui, e o
// cartão que não encontrar o arquivo aparece como placa da marca, em vez de
// ícone de imagem quebrada.
//
// `tag` descreve o assunto da peça, não o cliente. Nome de marca real só
// entra aqui com autorização de quem é dono dela.

export const COMMUNITY_ART = [
  { src: '/comunidade/01.webp', tag: 'Imóveis' },
  { src: '/comunidade/02.webp', tag: 'Estética' },
  { src: '/comunidade/03.webp', tag: 'Agro' },
  { src: '/comunidade/04.webp', tag: 'Conteúdo' },
  { src: '/comunidade/05.webp', tag: 'Restaurante' },
  { src: '/comunidade/06.webp', tag: 'Hotelaria' },
  { src: '/comunidade/07.webp', tag: 'Educação' },
  { src: '/comunidade/08.webp', tag: 'Advocacia' },
  { src: '/comunidade/09.webp', tag: 'Gestão' },
  { src: '/comunidade/10.webp', tag: 'Turismo' }
]
