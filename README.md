# COLAS Lot Pack

Current build: **v124-offline-foundation**

This build keeps the existing form and print behaviour, and adds the offline foundation:

- installable PWA app shell
- structured IndexedDB autosave on the worker's device
- persistent pending-submission queue
- online/reopen/background-sync retry hooks
- visible online/offline/pending status

## Still required before live email delivery

Configure `SUBMIT_ENDPOINT` and `DEFAULT_RECIPIENT` in `app-config.js`, and deploy a secure server endpoint that:

1. authenticates the worker,
2. validates and stores the lot pack,
3. generates the controlled PDF,
4. emails it to the configured work address,
5. returns a confirmed submission ID.

Never place email credentials or service secrets in this repository.
