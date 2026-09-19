/**
 * Carga inicial da aba "Financeiro" (Data | Tipo | Descrição | Valor), coletada a partir
 * de prints de comprovantes/pedidos enviados pelo Ricardo em setembro/2026 e conferida
 * manualmente para nunca contar a mesma compra duas vezes (mesmo quando apareceu em mais
 * de um print, por causa de rolagem de tela).
 *
 * Decisões de categorização, conforme confirmado com o usuário:
 * - "Fôrmas": só as 2 compras mais recentes de K.F. Industria (as 2 mais antigas e a
 *   compra em Turim/Itália ficaram de fora, por instrução explícita do usuário).
 * - "Transporte": pagamentos ao motorista Clodoaldo (Franca x SP).
 * - "Ferramentas e Insumos": compras via Mercado Livre, AliExpress e TikTok Shop.
 * - "Equipamentos": a prensa boca de sapo (compra separada, não confundir com a prensa já
 *   registrada em outra planilha de investimento inicial).
 *
 * Usado só como carga ÚNICA de bootstrap (ver seedExpensesIfEmpty em server.ts): so
 * escreve se a aba estiver 100% vazia, pra nunca duplicar linhas em cada deploy/restart.
 */
export const EXPENSES_SEED: Array<[string, string, string, number]> = [
  ["24/06/2025", "Ferramentas e Insumos", "Mercado Livre #2000012057358574 - 2 Und Refletor Led Osram 50w", 263.96],
  ["08/08/2025", "Ferramentas e Insumos", "Mercado Livre #2000012593465556 - Torno Morsa De Bancada Giratória C/ Bigorna Menegotti", 266.89],
  ["16/08/2025", "Ferramentas e Insumos", "Mercado Livre #2000008876682851 - Reticulador Catalizador De Colas + Adesivo Para Botes Inflável (2 produtos)", 310.4],
  ["20/08/2025", "Ferramentas e Insumos", "Mercado Livre #2000008924276967 - Servo Motor Direct Drive 550w", 499.8],
  ["28/08/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 350.0],
  ["04/09/2025", "Ferramentas e Insumos", "AliExpress (pedido 8204620208798503) - 6pcs Carabiner Keychains Aluminum Alloy D-type Hooks", 292.04],
  ["04/09/2025", "Ferramentas e Insumos", "AliExpress (pedido 8204620208798503) - KNIPEX Carpenters Pincers Cutter Nipper Plier 180mm", 281.99],
  ["25/09/2025", "Ferramentas e Insumos", "Mercado Livre #2000009344416901 - Caneta Prata Riscar Couros + Martelo Sapateiro + Termômetro Laser Infravermelho (3 produtos)", 179.88],
  ["30/09/2025", "Ferramentas e Insumos", "Mercado Livre #2000013228669124 - Saca Rolamentos E Polias 3 Garras", 78.12],
  ["30/09/2025", "Ferramentas e Insumos", "Mercado Livre #2000013219323440 - 02 Frasco Gotejador Conta Gotas", 28.99],
  ["17/10/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 70.0],
  ["20/10/2025", "Ferramentas e Insumos", "Mercado Livre #2000013480959608 - Escova Circular Aço Ondulado 6x1", 60.01],
  ["20/10/2025", "Ferramentas e Insumos", "Mercado Livre #2000009666364099 - Escova Circular De Aço Latonano Para Esmeril", 57.9],
  ["31/10/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 45.0],
  ["07/11/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 45.0],
  ["14/11/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 45.0],
  ["18/11/2025", "Ferramentas e Insumos", "Mercado Livre #2000010085029471 - Mascara Facial Barreira De Proteção Acrílico 10 Filtros", 39.18],
  ["24/11/2025", "Fôrmas", "Pix - K F Industria de Formas Plasticas para Calçados Ltda", 419.0],
  ["28/11/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 45.0],
  ["08/12/2025", "Ferramentas e Insumos", "Mercado Livre #2000010438068623 - Itc Kit150 Exaustor Para Banheiros Com Duto", 155.0],
  ["23/12/2025", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 25.0],
  ["03/01/2026", "Ferramentas e Insumos", "Mercado Livre #2000014558878262 - Kit 4 Rodízio Rodas Para Móveis Reforçado", 61.41],
  ["15/01/2026", "Ferramentas e Insumos", "Mercado Livre #2000011060692835 - 01 Cola Vipafix 1Kg + 01 Catalisador 25ml", 165.0],
  ["01/02/2026", "Ferramentas e Insumos", "Mercado Livre #2000011336635791 - Lâmpada Secagem Estufa Infra Vermelho 250w (2un)", 84.82],
  ["06/02/2026", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 35.0],
  ["18/02/2026", "Ferramentas e Insumos", "TikTok Shop (pedido 582587689357640731) - CROWNFUL BR - Ultrean Balança de Café 5,9\" (balança de precisão)", 88.6],
  ["13/03/2026", "Ferramentas e Insumos", "Mercado Livre #2000012021670627 - Adesivo Para Sandália De Capacho Amazonas Pu 2,85kg", 199.0],
  ["25/04/2026", "Ferramentas e Insumos", "Mercado Livre #2000012672876263 - Escova De Aço Para Furadeira + Vareta Solda Alumínio X Cobre (2 produtos)", 149.88],
  ["03/06/2026", "Ferramentas e Insumos", "TikTok Shop (pedido 584259695420933147) - CNM Shop UD - Carrinho Organizador Multiuso Preto", 94.91],
  ["16/06/2026", "Ferramentas e Insumos", "Mercado Livre #2000016965308062 - 3M 6200 Kit Máscara Semifacial", 249.9],
  ["26/06/2026", "Equipamentos", "Prensa boca de sapo - comprada com Leonardo, em Franca", 7100.0],
  ["27/06/2026", "Transporte", "Pix - Clodoaldo Henrique Azarias (motorista, Franca x SP)", 350.0],
  ["09/07/2026", "Ferramentas e Insumos", "Mercado Livre #2000013932683129 - Kit Cola Vipafix 1kg Catalisador 60 (3un) Emenda Correia", 588.6],
  ["05/08/2026", "Ferramentas e Insumos", "Mercado Livre #2000017768873898 - Removedor Liquido Bufpal 1000ml Vipal", 106.63],
  ["07/08/2026", "Ferramentas e Insumos", "Mercado Livre #2000017816380344 - Exaustor Industrial 40cm Metálico Parede", 679.9],
  ["11/08/2026", "Fôrmas", "Pix - K F Industria de Formas Plasticas para Calçados Ltda", 334.32],
  ["04/09/2026", "Ferramentas e Insumos", "Mercado Livre #2000014865110203 - Solvente Para Cola Kisafix - Killing 900ml", 31.52],
  ["07/09/2026", "Ferramentas e Insumos", "Mercado Livre - Alicate De Pressão Mordente Curvo 5 Sata (Imperial Ferramentas) (data de compra aproximada)", 60.0],
  ["13/09/2026", "Ferramentas e Insumos", "Mercado Livre #2000015012334807 - Cadeado Segredo 25mm Stam Senha", 25.17],
  ["14/09/2026", "Ferramentas e Insumos", "TikTok Shop (pedido 585960084563067931) - Pock Stock - 04 Painel Ferramentas Plásticas", 110.94],
];
