/** Message types on the content-script <-> service-worker channel. */
export const MSG = {
  EXPLAIN: "context-lens/explain",
};

/** Shape of a failure the popup knows how to render. */
export const ERROR_CODES = {
  NO_API_KEY: "no_api_key",
  API_ERROR: "api_error",
  REFUSED: "refused",
};
