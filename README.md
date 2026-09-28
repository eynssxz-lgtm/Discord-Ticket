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

Moderation commands include `/kick`, `/ban`, `/timeout`, `/mute`, `/purge`, `/jail`, `/unjail`, `/role add`, `/avatar`, and `/cover`. For example:

```text
/kick member:@member reason:spam
/timeout member:@member duration:10m reason:spam
/purge amount:25
/jail member:@member
/role add member:@member role:@Role
```

The same actions are available under `/mod` subcommands where applicable. Role assignment requires **Manage Roles** for both the command user and bot, with the bot's highest role above the target member and selected role. You can select a member by mention or user picker.

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

Antinuke is disabled by default. Members with **Manage Server** can configure it with `/antinuke enable`, `/antinuke disable`, and `/antinuke status`. New configurations default to removing all manageable roles after one matching action. Choose another response with `/antinuke set-punishment`, using `remove-roles`, `timeout`, `kick`, `ban`, or `none`. Existing servers keep their saved punishment until changed.

Whitelist actors and targets with the `/antinuke whitelist-role`, `/antinuke whitelist-category`, and `/antinuke whitelist-channel` command groups. Each group provides `add`, `remove`, and `list` subcommands. `/antinuke whitelist-list` shows all exemptions.

Whitelisted roles exempt their members from penalties. Whitelisted channels and categories exempt deletion of that channel or channels inside that category. SINCLAIR monitors channel deletion, role creation/deletion, member bans/kicks and pruning, bot additions, invite creation and posted Discord invite URLs, webhook deletion, dangerous permission grants, and assignment of roles with dangerous permissions. One matching action by a non-whitelisted member triggers the configured action immediately. Invite URLs in messages require the **Message Content Intent** to be enabled in the Discord Developer Portal. The bot needs **View Audit Log** and the permission for the selected action; its role must be high enough to moderate potential offenders. Role removal only affects roles Discord allows the bot to manage. `none` detects and logs events without automatically punishing the actor.

## Welcome Messages

Use `/welcome channel`, `/welcome message`, `/welcome status`, `/welcome disable`, and `/welcome preview` to manage welcome messages. `/set-welcome-channel` and `/set-welcome-message` are also available. Supported placeholders are `{user}`, `{username}`, `{server}`, and `{memberCount}`.

Use `/welcome embed edit` or `/edit-embed` to open the prefilled embed editor. Leave a field blank to clear it. `/welcome embed clear` clears all embed fields; select a field to clear only that field.

Welcome settings persist per server in `data/guild-welcome.json`. Enable the **Server Members Intent** and grant the bot permission to view and send messages in the welcome channel. Welcome configuration commands require **Manage Server**.

## Help and Tests

Use `/help` to list commands. Run the test suite with `npm test`.