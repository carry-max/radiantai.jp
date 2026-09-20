# Overwolf production release

## Current status

- App proposal submitted successfully on 2026-09-20 (Japan time).
- Submitted as `RadiantAI`, `ow-electron`, `Guides & Trainers`, `VALORANT`, with business model `None` for the initial free public beta.
- Overwolf confirmed receipt and states that follow-up information is normally sent by email within two days. Check spam and contact Overwolf support if no message arrives after that window.
- DevRel approval, app whitelisting, Developer Console access, App UID, API key, and Build Key are still pending.

## External approvals required

1. Receive Overwolf DevRel approval and app whitelisting.
2. Complete Riot Games' third-party application approval for the public VALORANT app. Overwolf requires this before publication even when the Riot API is not used.
3. Obtain Developer Console access, the App UID, API key, and Build Key.
4. Obtain a Windows code-signing certificate from a trusted CA such as DigiCert or Sectigo. The certificate owner must match the real publisher identity.
5. Complete QA using `QA_PLAN.md` and submit the signed installer to the Testing channel.
6. Resolve QA feedback, promote the approved build to Production, and start with a limited rollout.

## Secret environment variables

Set these only in the local secure build environment or protected CI secrets:

```text
OW_CLI_EMAIL=
OW_CLI_API_KEY=
OW_BUILD_KEY=
CSC_LINK=
CSC_KEY_PASSWORD=
```

`CSC_LINK` may be a protected path or supported certificate reference. Never commit the certificate, password, Overwolf keys, or a populated `.env` file.

## Build and signature verification

```powershell
cd apps/windows-overwolf
npm ci
npm run build:production
```

The production script builds React, Electron, and Rust; runs the Overwolf builder; locates the generated installer; and fails unless Windows reports a valid Authenticode signature.

For QA, upload the resulting `RadiantAI-Windows-Setup-0.1.0.exe` to an Overwolf Testing channel first. After approval, use the Production channel and add release notes describing the post-match Death clip flow, privacy behavior, supported Windows versions, and known limitations.
