/**
 * Bairros cobertos (tabela 11.2; épicos 8.1 e 8.14), numa fonte só: o enum da ferramenta m2_bairro,
 * a mensagem "fora da cobertura", a ferramenta sobre e o site leem daqui. Os prefixos de CEP e os
 * padrões de nome ficam no banco (m2_bairros, pelo seed.sql e pelas migrations); um teste confere
 * que os slugs daqui batem com os do seed.
 */
export const BAIRROS_COBERTOS = [
  { slug: "perdizes", nome: "Perdizes" },
  { slug: "pompeia", nome: "Pompeia" },
  { slug: "pinheiros", nome: "Pinheiros" },
  { slug: "vila-madalena", nome: "Vila Madalena" },
  { slug: "alto-de-pinheiros", nome: "Alto de Pinheiros" },
  { slug: "alto-da-lapa", nome: "Alto da Lapa" },
  { slug: "higienopolis", nome: "Higienópolis" },
  { slug: "jardins", nome: "Jardins" },
  { slug: "cerqueira-cesar", nome: "Cerqueira César" },
  { slug: "itaim-bibi", nome: "Itaim Bibi" },
  { slug: "moema", nome: "Moema" },
  { slug: "vila-nova-conceicao", nome: "Vila Nova Conceição" },
  { slug: "brooklin", nome: "Brooklin" },
  { slug: "campo-belo", nome: "Campo Belo" },
] as const;

export type SlugBairro = (typeof BAIRROS_COBERTOS)[number]["slug"];

/** Slugs, na ordem da lista (para z.enum). */
export const SLUGS_BAIRROS = BAIRROS_COBERTOS.map((b) => b.slug) as unknown as readonly [SlugBairro, ...SlugBairro[]];

/** Nomes de exibição, na ordem da lista. */
export const NOMES_BAIRROS = BAIRROS_COBERTOS.map((b) => b.nome);

/** Junta nomes em português ("A, B, C e D"). Recebe: os nomes. Devolve: o texto (vazio se não houver nomes). */
export function listaPorExtenso(nomes: readonly string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
