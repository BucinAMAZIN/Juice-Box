/** Hard Rock Bet deep links. The same format ParlayBOT uses: one selection id opens one bet, several ids open a slip. */
const SLIP = "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/";

export function hardRockUrl(sids: string[]): string {
  const clean = [...new Set(sids.filter((s) => /^\d+$/.test(s)))];
  return clean.length ? `${SLIP}${clean.join(",")}` : "";
}
