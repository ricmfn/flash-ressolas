import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { RubberRepository } from "./rubberRepository.js";
import { ExpensesRepository } from "./expensesRepository.js";

/**
 * Migrações one-off, chamadas uma vez no boot (ver server.ts). Cada uma so faz algo se
 * ainda achar o "fingerprint" do estado antigo que precisa corrigir — depois de rodar uma
 * vez o fingerprint some e a funcao vira no-op pra sempre, mesmo chamada de novo a cada
 * deploy/restart. Diferente de expensesSeed.ts/rubberSeed.ts (que so escrevem se a aba
 * estiver 100% vazia): estas rodam depois que a planilha ja foi seedada e precisa de um
 * ajuste pontual.
 */

const NOTE_LOTE_DAVOS =
  "Folha 1 de 3 do lote da fatura Davos S.p.A. nº E-137 (20/03/2026): 3x Stick Evolution Nero 4mm + " +
  "1x Gripp Nero 1.6/1.7mm. Material+frete = €319,76 + €180,00 = €499,76 (câmbio R$6,00/EUR) = R$2.998,56, " +
  "+ impostos/desembaraço no Brasil R$3.736,45 (Imposto de Importação R$2.115,15 + ICMS R$1.155,26 + " +
  "Armazenagem ABV R$255,26 + Taxa UPS R$210,78) = R$6.735,01 no total do lote, dividido igualmente pelas " +
  "4 folhas (~R$1.683,75 cada). Frete via Marca Service (fatura 24/03/2026), rastreio " +
  "1ZH815490407835261. Chegada/liberação por volta de 01/04/2026.";

/**
 * A primeira versão da carga de Borrachas (deployada antes dos dados reais da fatura
 * Davos chegarem) escreveu 2 linhas com nomes/valores incompletos: "Davos Stick" e "Rand"
 * (fornecedor "Davos ..."). Substitui essas 2 linhas pelos nomes reais do invoice (Stick
 * Evolution Nero + Gripp Nero) e completa as 2 folhas Stick Evolution que faltavam,
 * preservando o que o Ricardo já tiver editado no "% restante" de cada uma (so mexe nas
 * colunas Data/Marca/Fornecedor/Valor/Observações).
 */
export async function fixRubberSeedV1(sheets: SheetsClient, rubberRepo: RubberRepository): Promise<void> {
  try {
    const rows = await rubberRepo.readAll();
    const davosStick = rows.find((r) => r.brand === "Davos Stick");
    const oldRand = rows.find((r) => r.brand === "Rand" && r.supplier.includes("Davos"));
    const unparallel = rows.find((r) => r.brand === "Unparallel" && r.notes.includes("⚠️"));

    if (!davosStick && !oldRand && !unparallel) return; // ja corrigido antes

    const sheetName = config.rubberSheetName;

    if (davosStick) {
      const r = davosStick.sheetRowIndex;
      await sheets.updateCell(sheetName, `A${r}`, "20/03/2026", true);
      await sheets.updateCell(sheetName, `B${r}`, "Stick Evolution Nero (4mm)", true);
      await sheets.updateCell(sheetName, `C${r}`, "Davos S.p.A. (fatura E-137)", true);
      await sheets.updateCell(sheetName, `D${r}`, 1683.75, true);
      await sheets.updateCell(sheetName, `F${r}`, `Folha 3 de 3 do lote. ${NOTE_LOTE_DAVOS}`, true);
      // as outras 2 folhas do mesmo lote (ja consumidas antes desta) nao existiam no seed antigo.
      await sheets.appendRows(sheetName, [
        [
          "20/03/2026",
          "Stick Evolution Nero (4mm)",
          "Davos S.p.A. (fatura E-137)",
          1683.75,
          0,
          "Folha 1 de 3 do lote (ver observação completa na folha 3/3). Já acabou.",
        ],
        [
          "20/03/2026",
          "Stick Evolution Nero (4mm)",
          "Davos S.p.A. (fatura E-137)",
          1683.75,
          0,
          "Folha 2 de 3 do lote (ver observação completa na folha 3/3). Já acabou.",
        ],
      ]);
    }

    if (oldRand) {
      const r = oldRand.sheetRowIndex;
      await sheets.updateCell(sheetName, `A${r}`, "20/03/2026", true);
      await sheets.updateCell(sheetName, `B${r}`, "Gripp Nero (1.6/1.7mm)", true);
      await sheets.updateCell(sheetName, `C${r}`, "Davos S.p.A. (fatura E-137)", true);
      await sheets.updateCell(sheetName, `D${r}`, 1683.76, true);
      await sheets.updateCell(
        sheetName,
        `F${r}`,
        "Faz parte do mesmo lote das 3 folhas Stick Evolution Nero (ver observação completa nelas para o detalhe do invoice).",
        true,
      );
    }

    if (unparallel) {
      await sheets.updateCell(
        sheetName,
        `F${unparallel.sheetRowIndex}`,
        "Primeira compra de borracha do negócio, feita na SBI antes da viagem a Turim (antes de setembro/2025). " +
          'Confirmado com o Ricardo: são 2 compras separadas na SBI — esta e a de fevereiro/2026 (linhas "C4" + "Rand 3mm").',
        true,
      );
    }

    rubberRepo.invalidateCache();
    console.log('Aba "Borrachas": corrigidas as linhas do lote Davos (fatura E-137) e a nota da Unparallel.');
  } catch (err) {
    console.error("Falha ao corrigir carga inicial de borrachas:", err instanceof Error ? err.message : err);
  }
}

/**
 * Itens de investimento inicial que vêm da "planilha principal" (Etapa 1 - compra de
 * equipamentos, Etapa 2 - materiais, Formação Itália) e nunca tinham sido lançados na
 * aba Financeiro do app — só o que o Ricardo mandou por print (a partir de
 * setembro/2025) entrou na carga inicial. Sem data exata disponível pra a maioria (a
 * planilha principal só tem valores agregados, sem data por item); Formação Itália usa
 * setembro/2025 porque é a mesma viagem a Turim já confirmada para as compras de
 * borracha/fôrmas daquele período.
 */
const LEGACY_INVESTMENT_ROWS: Array<[string, string, string, number]> = [
  ["", "Equipamentos", "Lixadeira (Etapa 1 - planilha principal, data exata não informada)", 3650],
  ["", "Equipamentos", "Compressor (Etapa 1 - planilha principal, data exata não informada)", 3032],
  [
    "",
    "Equipamentos",
    "Prensa (Etapa 1 - planilha principal, data exata não informada — diferente da Prensa boca de sapo)",
    3050,
  ],
  ["", "Equipamentos", "Morça (Etapa 1 - planilha principal, data exata não informada)", 300],
  ["", "Materiais", "Borracha (Etapa 2 - planilha principal, data exata não informada)", 3049],
  ["", "Materiais", "Cola + aditivo (Etapa 2 - planilha principal, data exata não informada)", 310],
  ["", "Materiais", "Lixa/abrasivo (Etapa 2 - planilha principal, data exata não informada)", 334],
  [
    "",
    "Fôrmas",
    "Fôrmas (Etapa 2 - planilha principal, valor legado — complementa as 2 compras de K.F. Industria já lançadas)",
    1500,
  ],
  ["", "Ferramentas e Insumos", "Tesourona (Etapa 2 - planilha principal, data exata não informada)", 211],
  ["09/2025", "Formação", "Curso (Formação Itália, Turim)", 5670],
  ["09/2025", "Formação", "Passagem (Formação Itália, Turim)", 6791.43],
  ["09/2025", "Formação", "Hospedagem (Formação Itália, Turim)", 1750],
  ["09/2025", "Formação", "Estadia (Formação Itália, Turim)", 6000],
];

export async function addLegacyInvestmentIfMissing(
  sheets: SheetsClient,
  expensesRepo: ExpensesRepository,
): Promise<void> {
  try {
    const rows = await expensesRepo.readAll();
    const already = rows.some((r) => r.description.startsWith("Lixadeira (Etapa 1"));
    if (already) return;
    await sheets.appendRows(config.expensesSheetName, LEGACY_INVESTMENT_ROWS);
    expensesRepo.invalidateCache();
    console.log(
      `Aba "${config.expensesSheetName}": ${LEGACY_INVESTMENT_ROWS.length} itens de investimento inicial (planilha principal) adicionados.`,
    );
  } catch (err) {
    console.error("Falha ao adicionar investimento inicial legado:", err instanceof Error ? err.message : err);
  }
}
