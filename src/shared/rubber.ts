/** Uma folha de borracha (materia-prima de sola), rastreada na aba "Borrachas". */
export interface RubberSheet {
  sheetRowIndex: number;
  date: string;
  brand: string;
  supplier: string;
  value: number | null;
  /** 0-100. null quando ainda nao informado. */
  percentRemaining: number | null;
  notes: string;
}

export interface RubberSummary {
  sheets: RubberSheet[];
  /** Soma do valor de compra de todas as folhas com valor informado. */
  totalInvested: number;
  /** Folhas com % restante > 0 (ainda em uso). */
  activeCount: number;
  /** Folhas com % restante = 0 (ja acabaram). */
  finishedCount: number;
}

export function summarizeRubber(sheets: RubberSheet[]): RubberSummary {
  let totalInvested = 0;
  let activeCount = 0;
  let finishedCount = 0;
  for (const s of sheets) {
    if (s.value !== null) totalInvested += s.value;
    // percentRemaining === null (ainda nao informado) conta como ativa: presume-se em uso
    // ate que o usuario confirme que zerou.
    if (s.percentRemaining === 0) {
      finishedCount++;
    } else {
      activeCount++;
    }
  }
  return { sheets, totalInvested, activeCount, finishedCount };
}
