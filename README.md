# SINCLAIR

A Discord.js starter bot with a configurable command prefix per server.

## Requirements

- Node.js 20 or later
- A Discord application and bot token

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from the Discord Developer Portal.
3. In the Discord Developer Portal, enable the **Message Content Intent** for the bot.
4. Invite the bot with the permissions it needs, then start it with `npm start`.

The default prefix is `!`. Server members with **Manage Server** can change it with:

```text
!setprefix ?
!set prefix ?
```

The new prefix is stored per server in `data/guild-prefixes.json`. After changing it, use the new prefix for subsequent commands.

Set a text channel for server logs with:

```text
!set logs #mod-logs
!set logs off
```

The bot logs voice join/leave/move events, message deletions, and deleted image attachments there.

## Autoresponders

Server members with **Manage Server** can add exact-match autoresponders:

```text
!autoresponder add hello | Hi there!
!autoresponder list
!autoresponder remove hello
```

Triggers are case-insensitive and saved per server in `data/guild-autoresponders.json`.

## Antinuke

Antinuke is disabled by default. A member with **Manage Server** can configure it with:

```text
!antinuke enable
!antinuke set punishment timeout
!antinuke whitelist role add @TrustedStaff
!antinuke whitelist category add #private-category
!antinuke whitelist channel add #important-channel
!antinuke whitelist list
!antinuke status
```

Use `!antinuke whitelist <role|category|channel> remove <mention or ID>` to remove an exemption, or `!antinuke disable` to turn protection off. Whitelisted roles exempt their members from penalties. Whitelisted channels and categories exempt deletion of that channel or channels inside that category. SINCLAIR monitors channel/category deletion, role deletion, member bans/kicks, bot additions, and webhook deletion. Three matching actions by one non-whitelisted member within ten seconds trigger a ten-minute timeout. The bot needs **View Audit Log** and **Moderate Members** permissions, and its role must be high enough to timeout potential offenders.

Choose the response with `!antinuke set punishment <timeout|kick|ban|none>`. `none` detects and logs threshold events without automatically punishing the actor. The default is `timeout` for ten minutes. The bot needs **Moderate Members** for timeouts, **Kick Members** for kicks, or **Ban Members** for bans, plus a role above the actor.

## Welcome Messages

Set a channel to enable welcome messages, then customize the message and embed:

```text
/set-welcome-channel channel:#welcome
/set-welcome-message message:Welcome {user} to {server}!
/edit-embed
!welcome preview
```

`/edit-embed` opens a prefilled form for title, description, color, footer, and image URL; leave a field blank to clear it. The original prefix commands remain available. Supported placeholders are `{user}`, `{username}`, `{server}`, and `{memberCount}`. Use `!welcome disable` to stop sending welcomes. Settings persist per server in `data/guild-welcome.json`. Enable the **Server Members Intent** in the Discord Developer Portal and grant the bot permission to view and send messages in the welcome channel. Slash commands require the **Manage Server** permission and are registered in each server when the bot starts.

Run the tests with `npm test`.