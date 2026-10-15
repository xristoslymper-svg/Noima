# Internationalization verification

Final remote CI results and screenshots are being collected on the feature branch. This file will be updated with the tested commit, workflow links and retained evidence after the full suite completes.

Already verified on preview commit `819889a`: Vercel deployment completed; Greek login switches to English through the real UI and remains English after refresh. GitHub typecheck, lint, translation validation and production build passed. Recorder browser tests, visual/interactions and Copilot evaluation passed. Initial-visit unsaved editor and database invariance checks passed. Subsequent full-flow checks exposed a payment-shell reconciliation issue, corrected in `10072f7` with a regression test.

No production data, live patient accounts or real recipient mailboxes are used in the browser suite.
