# RadiantAI — Riot product registration

## Registration status

Prepared for submission on 2026-09-20. The production site, Terms of Service, privacy notice, Riot legal boilerplate, and server-side RSO scaffold are live. Submission requires the product owner's Riot account login.

## Product details

- Product name: `RadiantAI`
- Product URL: https://radiantai.jp
- Terms of Service: https://radiantai.jp/terms
- Privacy notice: https://radiantai.jp/privacy
- Pricing: https://radiantai.jp/pricing
- Target region: Japan
- Primary game: VALORANT
- Product type: Windows and web post-match training tool

## Short description

RadiantAI is a Japanese post-match coaching product for VALORANT. It helps a player review their own match history and selected death clips, identify repeatable weaknesses, and turn the evidence into a small next practice task. It does not provide live tactical advice, opponent intelligence, timers, aim assistance, input automation, or any in-match decision support.

## Full application description

RadiantAI serves Japanese VALORANT players who want a structured review after a match. The free tier includes one review. The optional subscription provides separate monthly allowances for match-history review, short death-clip review, and deeper replay review.

The match-history mode is opt-in. After Riot approval, a signed-in RadiantAI user explicitly chooses to connect their Riot account through Riot Sign On. The server uses the approved credentials to read only that player's permitted identity and match-history data. The production API key and RSO client secret remain server-side and are never included in the Windows binary or browser bundle. Match data is used to identify patterns such as repeated opening deaths, difficult maps or agents, and which matches should receive a deeper review. No Riot data is exposed to another player.

The Windows app also uses Overwolf GEP only to label the local player's kill and death moments and Recorder to keep a local 35-second replay buffer. During an active match it records only and shows no overlay or advice. On death it saves a 30-second local clip. After the match, the player may explicitly choose a clip for a private AI review. Temporary cloud video is deleted after processing.

## Player flow

1. The player creates or signs in to a RadiantAI account.
2. The account page explains what Riot data will be used and asks the player to connect through Riot Sign On.
3. Riot authenticates the player and returns consented identity access to the RadiantAI server.
4. The player starts a post-match review from the Windows app.
5. The server retrieves only the connected player's permitted match history, classifies up to the plan allowance, and returns a private review.
6. The player can disconnect their Riot account from the account page.

## Riot services requested

- Riot Sign On for explicit player opt-in and account linking
- Account identity needed to resolve the consenting player
- VALORANT match-list and match-detail access for the connected player's own history
- VALORANT content metadata for readable map, agent, queue, and season labels

No live-client, opponent scouting, ranked-ladder replacement, betting, gambling, or tournament functionality is requested.

## Data handling

- The API key and RSO client secret are held only in protected server environment variables.
- Access tokens are used server-side for the approved flow and are not returned to the Windows app or browser.
- The product stores the Riot subject identifier, display label, connection timestamp, match-analysis results, and usage records for the connected RadiantAI account.
- Players can unlink Riot from their account page and request deletion through the published contact channel.
- Riot-derived personal data is never shown to another player.

## Monetization

RadiantAI has a free tier and an optional 900 JPY monthly subscription. Paid output is transformative coaching: it adds classifications, evidence-based explanations, trend summaries, and practice priorities to the player's own match data. The product contains no betting or gambling.

## Compliance statement

RadiantAI is strictly post-match. It does not alter the goal of VALORANT, bypass a player skill test, dictate live decisions, automate input, or show dynamic real-time tactical information. Product metadata and features will be kept current in the Riot Developer Portal.

RadiantAI isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Domain verification

When Riot provides the verification string, publish it at the exact path shown in the Developer Portal on `radiantai.jp`, then confirm the application is marked verified before waiting for review.
