/**
 * Carga inicial da aba "Borrachas", a partir do que o Ricardo descreveu em setembro/2026
 * (datas de compra confirmadas numa mensagem seguinte: Elite/Spartan/1a Rand = Turim,
 * setembro/2025; Unparallel/SBI = primeira compra de borracha do negocio, anterior a
 * todas as outras — nao e a mesma compra da "C4"). O que antes estava anotado soltamente
 * como "Davos Stick" + "Rand da encomenda Davos" virou, com o invoice real (fatura Davos
 * S.p.A. no E-137, 20/03/2026), 3 folhas "Stick Evolution Nero" + 1 folha "Gripp Nero",
 * com o custo do lote (material + frete internacional + impostos de importacao) dividido
 * igualmente entre as 4. Alguns valores de compra ainda nao foram informados — em vez de
 * adivinhar, cada lacuna vira uma observacao explicita, editavel direto na aba
 * "Borrachas" do dashboard (nao precisa mexer na planilha nem falar com o Claude de novo
 * pra corrigir).
 *
 * Igual ao expensesSeed.ts: so roda uma vez, se a aba estiver 100% vazia (ver
 * seedRubberIfEmpty em server.ts).
 */
export const RUBBER_SEED: Array<{
  date: string;
  brand: string;
  supplier: string;
  value: number | null;
  percentRemaining: number | null;
  notes: string;
}> = [
  {
    date: "",
    brand: "Unparallel",
    supplier: "SBI",
    value: 1600,
    percentRemaining: 0,
    notes:
      "Primeira compra de borracha do negócio, feita na SBI antes da viagem a Turim (ou seja, antes de setembro/2025). Confirmado pelo Ricardo: foram 2 compras separadas na SBI — esta e a de fevereiro/2026 (linhas \"C4\" + \"Rand 3mm\" abaixo). Data exata ainda não informada.",
  },
  {
    date: "09/2025",
    brand: "Elite",
    supplier: "Turim (Itália)",
    value: null,
    percentRemaining: 0,
    notes:
      "2 folhas, compradas em Turim em setembro/2025, já acabaram. Ficaram em uso até por volta de 01/04/2026 (quando a encomenda da Davos chegou). Falta valor de compra.",
  },
  {
    date: "09/2025",
    brand: "Spartan",
    supplier: "Turim (Itália)",
    value: null,
    percentRemaining: 0,
    notes: "Folha 1 de 2, comprada em Turim em setembro/2025, já acabou. Falta valor de compra.",
  },
  {
    date: "09/2025",
    brand: "Spartan",
    supplier: "Turim (Itália)",
    value: null,
    percentRemaining: null,
    notes: "Folha 2 de 2, comprada em Turim em setembro/2025, recém iniciada (setembro/2026). Falta % restante e valor de compra.",
  },
  // Lote da fatura Davos S.p.A. nº E-137 (20/03/2026): 3x Stick Evolution Nero (4mm) +
  // 1x Gripp Nero (1.6/1.7mm). Custo do lote todo: material+frete = €319,76 + €180,00 =
  // €499,76 (câmbio R$6,00/EUR, mesma taxa usada na compra de fôrmas em Turim) =
  // R$2.998,56, + impostos/desembaraço no Brasil R$3.736,45 (Importação R$2.115,15 +
  // ICMS R$1.155,26 + Armazenagem ABV R$255,26 + Taxa UPS R$210,78) = R$6.735,01 no
  // total. Sem preço por produto no invoice, dividido igualmente pelas 4 folhas
  // (~R$1.683,75 cada) — aproximação, editável se o valor real por folha for diferente.
  // Frete internacional via Marca Service (fatura 24/03/2026), rastreio
  // 1ZH815490407835261. Chegada/liberação alfandegária por volta de 01/04/2026.
  {
    date: "20/03/2026",
    brand: "Stick Evolution Nero (4mm)",
    supplier: "Davos S.p.A. (fatura E-137)",
    value: 1683.75,
    percentRemaining: 0,
    notes: "Folha 1 de 3 do lote (ver nota completa do lote na folha 3/3). Já acabou.",
  },
  {
    date: "20/03/2026",
    brand: "Stick Evolution Nero (4mm)",
    supplier: "Davos S.p.A. (fatura E-137)",
    value: 1683.75,
    percentRemaining: 0,
    notes: "Folha 2 de 3 do lote (ver nota completa do lote na folha 3/3). Já acabou.",
  },
  {
    date: "20/03/2026",
    brand: "Stick Evolution Nero (4mm)",
    supplier: "Davos S.p.A. (fatura E-137)",
    value: 1683.75,
    percentRemaining: 25,
    notes:
      "Folha 3 de 3 do lote — fatura Davos S.p.A. nº E-137 (20/03/2026): 3x Stick Evolution Nero 4mm + 1x Gripp Nero 1.6/1.7mm. Material+frete = €319,76 + €180,00 = €499,76 (câmbio R$6,00/EUR) = R$2.998,56, + impostos/desembaraço no Brasil R$3.736,45 (Imposto de Importação R$2.115,15 + ICMS R$1.155,26 + Armazenagem ABV R$255,26 + Taxa UPS R$210,78) = R$6.735,01 no total do lote, dividido igualmente pelas 4 folhas (~R$1.683,75 cada — aproximação, sem preço por produto no invoice). Frete via Marca Service (fatura 24/03/2026), rastreio 1ZH815490407835261. Chegada/liberação por volta de 01/04/2026.",
  },
  {
    date: "09/2025",
    brand: "Rand",
    supplier: "Turim (Itália)",
    value: null,
    percentRemaining: 0,
    notes: "Comprada em Turim em setembro/2025, já acabou. Falta valor de compra.",
  },
  {
    date: "20/03/2026",
    brand: "Gripp Nero (1.6/1.7mm)",
    supplier: "Davos S.p.A. (fatura E-137)",
    value: 1683.76,
    percentRemaining: 50,
    notes: "Faz parte do mesmo lote das 3 folhas Stick Evolution Nero (ver nota completa na folha 3/3 delas). Na metade.",
  },
  {
    date: "02/2026",
    brand: "C4",
    supplier: "Unparallel, SBI",
    value: 1600,
    percentRemaining: 60,
    notes: "Comprada em fevereiro/2026 junto com a Rand 3mm (as duas somaram R$2.699,00).",
  },
  {
    date: "02/2026",
    brand: "Rand 3mm",
    supplier: "SBI (comprada junto com a C4)",
    value: 1099,
    percentRemaining: 70,
    notes: "Muito grossa — só serve pra alguns projetos específicos.",
  },
];
