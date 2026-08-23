/**
 * Colombian peso formatting.
 *
 * The formatter is built once and reused: constructing an Intl.NumberFormat is expensive
 * enough that doing it per table row is wasteful. The es-CO locale already renders COP
 * without decimals, so 10000 becomes "$ 10.000".
 */

const EMPTY_VALUE = "—";

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
});

export const formatCurrency = (amount) => {
  // A missing amount is a legitimate state: a ticket that is still open has no total yet.
  // The check has to come before the conversion, because Number(null) is 0 and an open
  // ticket would then be rendered as "$ 0", which reads as a stay that cost nothing.
  if (amount === null || amount === undefined || amount === "") {
    return EMPTY_VALUE;
  }

  const numericAmount = Number(amount);

  return Number.isFinite(numericAmount) ? CURRENCY_FORMATTER.format(numericAmount) : EMPTY_VALUE;
};
