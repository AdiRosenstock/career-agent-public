# Career Form Helper

A custom, local Manifest V3 Chrome/Edge extension. This is not an official Codex extension and cannot be installed in the Codex in-app browser.

1. Start the dashboard (`npm start` in the project) and open **Apply yourself**.
2. Open `chrome://extensions` or `edge://extensions`, turn on Developer mode, choose **Load unpacked**, and select this `browser-extension` folder.
3. On the dashboard, preview and **Export basic profile**. Import the downloaded JSON in the extension popup.
4. Open an employer application. Click the extension, **Scan this page**, review/select matches, then **Fill selected**.
5. Review every resulting value in the employer form, handle the remaining fields, and submit yourself.

Only blank, recognizable text inputs in the main document are supported. Existing values, uploads, custom dropdowns, dates, checkboxes, employment repeaters, iframes, shadow DOM, consent, signatures, authorization, and demographics are left for manual entry. There is no automatic Next/Submit action. Some sites may reject programmatic input; verify visually.

The extension has activeTab, scripting, and local storage permissions. It has no persistent host access or background service. Profile data is kept in local extension storage; it is never sent to a service by the extension. Filling sends the selected values into the active webpage, which may autosave them. Use only on the intended employer form. Delete the exported JSON when no longer needed; **Delete profile** removes the browser copy. Re-export/import after editing the dashboard profile.

Automated fixture tests cover matching, no-overwrite, changed fields, selected fields, ignored declarations, and absence of submission. Browser installation and compatibility with every employer site require manual validation.
