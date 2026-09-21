// Contato da Achilles em um lugar so. Antes o numero estava escrito na mao
// em tres arquivos, e ja divergia entre eles.
export const CONTACT = {
  phone: '5541984991690',
  phoneLabel: '41 98499-1690',
  email: 'contato@achillesmedia.com.br',
  instagram: 'https://instagram.com/achilles.mediaz',
  instagramHandle: '@achilles.mediaz',
  site: 'https://achillesmedia.com.br',
  city: 'Patrocínio, MG'
}

export const waLink = (message = 'Olá, quero falar sobre o Achilles Content.') =>
  `https://wa.me/${CONTACT.phone}?text=${encodeURIComponent(message)}`
