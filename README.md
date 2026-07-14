# COLAS Lot Pack v126 — Durable Offline Queue

This release hardens the field workflow for prolonged loss of reception.

## Core protections
- Saves form changes to IndexedDB after input/change/blur and every 15 seconds.
- Requests persistent browser storage where the device supports it.
- Stores a locked submission locally before any upload attempt.
- Never deletes the local submission until Supabase confirms receipt.
- Retries indefinitely when connectivity/app activity returns, with duplicate protection through the existing client submission ID.
- Adds Send now, pending-count visibility, storage estimate, emergency backup export, and backup import.
- Removes the old placeholder alert that blocked secure submission.

## Important operational rule
No browser can protect data if the user clears website data, deletes the home-screen app, resets/loses the phone, or the operating system removes storage. For critical jobs, use **Export backup** after completion and save the JSON file to the iPhone Files app until the office confirms receipt.

## Deployment
Upload every file in this folder to the GitHub repository root and replace matching files.
