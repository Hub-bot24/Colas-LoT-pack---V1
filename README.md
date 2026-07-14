# COLAS QA — V2 Enterprise Foundation

This branch is the protected development foundation for **COLAS QA**.

## Current state

The existing Lot Pack application remains operational and unchanged at runtime. This foundation commit adds the architecture, security, offline durability, data model, delivery plan, and acceptance-test contracts that all V2 work must follow.

## Non-negotiable outcome

A completed Lot Pack must remain recoverable on the worker's device during extended periods without reception, must retry safely when connectivity returns, must upload exactly once, and must not be deleted locally until the server confirms durable receipt.

## Documents

1. `docs/01-product-scope.md`
2. `docs/02-offline-durability-contract.md`
3. `docs/03-architecture.md`
4. `docs/04-data-model.md`
5. `docs/05-security-and-roles.md`
6. `docs/06-acceptance-tests.md`
7. `docs/07-delivery-plan.md`
8. `docs/DECISIONS.md`

## Branch rules

- `main` remains the current production baseline.
- V2 work is performed only on `v2-enterprise-foundation` until release gates pass.
- No production merge without passing the offline, sync, security, PDF, email, and audit acceptance tests.
- No secret or service-role credentials may be committed to this repository.
