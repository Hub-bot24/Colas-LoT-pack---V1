/*
  Deployment configuration.
  SUBMIT_ENDPOINT must be an HTTPS server endpoint that accepts a JSON lot-pack
  submission and returns JSON containing { ok: true, submissionId: "..." }.
  Keep secrets on the server. Never put email passwords or API keys here.
*/
window.LOTPACK_CONFIG = Object.freeze({
  SUBMIT_ENDPOINT: "",
  DEFAULT_RECIPIENT: "",
  APP_VERSION: "v124-offline-foundation"
});
