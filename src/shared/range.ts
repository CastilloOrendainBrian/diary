// Date bounds used when a query covers every entry of a user.

/** Half-open range that includes all dates a user can enter. */
export const rangeFor = {
  all: () => ({ from: "0001-01-01", to: "9999-12-31" }),
};
