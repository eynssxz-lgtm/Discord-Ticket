# SINCLAIR

A Discord.js bot for server moderation, safety, welcome messages, and automation. Bot commands are Discord slash commands.

## Requirements

- Node.js 20 or later
- A Discord application and bot token

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from the Discord Developer Portal.
3. Enable the **Message Content Intent** and **Server Members Intent** for the bot.
4. Invite the bot with the permissions it needs, then start it with `npm start`.

Slash commands are registered in each server when the bot starts and when it joins a server. Command changes are applied on the next start.

## Server Setup

Members with **Manage Server** can configure logging and temporary voice channels:

```text
/set logs channel:#mod-logs
/set logs
/set temp-voice channel:#create-room
/set temp-voice
```

The bot logs voice join/leave/move events, message deletions, and deleted image attachments to the configured log channel. Members joining the temporary voice trigger channel are moved to a new channel in the same category when applicable. Empty temporary channels are deleted automatically. The bot needs **Manage Channels** and **Move Members** permissions.

## Moderation

Moderation commands include `/kick`, `/ban`, `/timeout`, `/mute`, `/purge`, `/jail`, `/unjail`, `/avatar`, and `/cover`. For example:

```text
/kick member:@member reason:spam
/timeout member:@member duration:10m reason:spam
/purge amount:25
/jail member:@member
```

The same actions are available under `/mod` subcommands. The bot needs the corresponding moderation permissions, with its highest role above members and roles it must manage.

Configure the jail role with `/set jail-role role:@Jailed`. Jailing removes the member's assigned roles and applies the jail role; unjailing removes that role and restores saved roles that still exist. Role snapshots and the configured jail role are stored in `data/guild-jails.json`. Configure the jail role's channel permissions separately.

## Autoresponders

Members with **Manage Server** can add exact-match autoresponders:

```text
/autoresponder add trigger:hello response:Hi there!
/autoresponder list
/autoresponder remove trigger:hello
```

Triggers are case-insensitive and saved per server in `data/guild-autoresponders.json`. Autoresponders continue to match ordinary messages; commands themselves use slash interactions.

## Antinuke

Antinuke is disabled by default. Members with **Manage Server** can configure it with `/antinuke enable`, `/antinuke disable`, and `/antinuke status`. Choose the response with `/antinuke set-punishment punishment:timeout`, using `timeout`, `kick`, `ban`, or `none`.

Whitelist actors and targets with the `/antinuke whitelist-role`, `/antinuke whitelist-category`, and `/antinuke whitelist-channel` command groups. Each group provides `add`, `remove`, and `list` subcommands. `/antinuke whitelist-list` shows all exemptions.

Whitelisted roles exempt their members from penalties. Whitelisted channels and categories exempt deletion of that channel or channels inside that category. SINCLAIR monitors channel deletion, role creation/deletion, member bans/kicks and pruning, bot additions, invite creation, webhook deletion, dangerous permission grants, and assignment of roles with dangerous permissions. Three matching actions by one non-whitelisted member within one second trigger the configured action. Invite creation is covered by Discord audit logs; invite URLs posted in message content are not. The bot needs **View Audit Log** and the permission for the selected action; its role must be high enough to moderate potential offenders. The default action is a ten-minute timeout. `none` detects and logs threshold events without automatically punishing the actor.

## Welcome Messages

Use `/welcome channel`, `/welcome message`, `/welcome status`, `/welcome disable`, and `/welcome preview` to manage welcome messages. `/set-welcome-channel` and `/set-welcome-message` are also available. Supported placeholders are `{user}`, `{username}`, `{server}`, and `{memberCount}`.

Use `/welcome embed edit` or `/edit-embed` to open the prefilled embed editor. Leave a field blank to clear it. `/welcome embed clear` clears all embed fields; select a field to clear only that field.

Welcome settings persist per server in `data/guild-welcome.json`. Enable the **Server Members Intent** and grant the bot permission to view and send messages in the welcome channel. Welcome configuration commands require **Manage Server**.

## Help and Tests

Use `/help` to list commands. Run the test suite with `npm test`.