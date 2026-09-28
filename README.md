# SINCLAIR

A Discord.js bot for server moderation, safety, welcome messages, and automation. Commands are available as Discord slash commands and with the `,` text prefix.

## Requirements

- Node.js 20 or later
- A Discord application and bot token

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from the Discord Developer Portal.
3. Enable the **Message Content Intent** and **Server Members Intent** for the bot.
4. Invite the bot with the permissions it needs, then start it with `npm start`.

Slash commands are registered in each server when the bot starts and when it joins a server. Comma-prefixed text commands are also available; command changes are applied on the next start.

Use the comma prefix as an alias for the slash command families, for example `,kick @member reason`, `,role add @member @role`, `,welcome status`, `,antinuke status`, and `,autoresponder list`. Existing slash commands remain available. Run `,help` for both forms and the argument syntax.

## Server Setup

Members with **Manage Server** can configure logging and temporary voice channels. The text-command prefix is `,`:

```text
,set logs channel:#mod-logs
,set logs
,set temp-voice channel:#create-room
,set temp-voice
```

The bot logs voice join/leave/move events to the configured log channel. Deleted messages are logged as embeds with the author, channel, timestamp, content, and any image attachment. Members joining the temporary voice trigger channel are moved to a new channel in the same category when applicable. Empty temporary channels are deleted automatically. The bot needs **Manage Channels** and **Move Members** permissions.

## Moderation

Use `/afk [reason]` to set a per-server AFK status, or use the text prefix version `,afk [reason]`. Your status clears the next time you send a message; members who mention you see the saved reason.

Moderation commands include `/kick`, `/ban`, `/timeout`, `/mute`, `/purge`, `/jail`, `/unjail`, `/role add`, `/avatar`, and `/cover`. For example:

```text
/kick member:@member reason:spam
/timeout member:@member duration:10m reason:spam
/purge amount:25
/jail member:@member
/role add member:@member role:@Role
```

Each moderation action has its own slash command; there is no duplicate `/mod` command group. Role assignment requires **Manage Roles** for both the command user and bot, with the bot's highest role above the target member and selected role. You can select a member by mention or user picker.

Configure the jail role with `/set jail-role role:@Jailed`. Jailing removes the member's assigned roles and applies the jail role; unjailing removes that role and restores saved roles that still exist. Role snapshots and the configured jail role are stored in `data/guild-jails.json`. Configure the jail role's channel permissions separately.

## Autoresponders

Members with **Manage Server** can add exact-match autoresponders:

```text
/autoresponder add trigger:hello response:Hi there!
/autoresponder list
/autoresponder remove trigger:hello
```

Triggers are case-insensitive and saved per server in `data/guild-autoresponders.json`. Autoresponders continue to match ordinary messages; commands themselves use slash interactions.

## Tickets

Members with **Manage Server** can run `,ticket setup #category @support-role [#panel-channel]`. `,ticket panel [#channel]` posts or reposts the panel. Members click **Create Ticket** to open a private channel visible to them and the support role. Each member can have one open ticket at a time.

Set transcript delivery with `,ticket logs #transcript-channel`; transcripts are uploaded there when a ticket is closed with the button, `,ticket close`, or `/ticket close`. Use `,ticket transcript` inside an open ticket to upload its transcript without closing it. The ticket owner or support staff can manage or close a ticket. Staff can also create a ticket with `/ticket create member:@user`.

## Antinuke

Antinuke is disabled by default. Members with **Manage Server** can configure it with `/antinuke enable`, `/antinuke disable`, and `/antinuke status`. The threshold is one matching action within a 10-second window; the punishment is applied on the first matching action. New configurations default to removing all manageable roles. Choose another response with `/antinuke set-punishment`, using `remove-roles`, `timeout`, `kick`, `ban`, or `none`. Existing servers keep their saved punishment until changed.

Whitelist actors and targets with the `/antinuke whitelist-role`, `/antinuke whitelist-category`, and `/antinuke whitelist-channel` command groups. Each group provides `add`, `remove`, and `list` subcommands. `/antinuke whitelist-list` shows all exemptions.

Whitelisted roles exempt their members from penalties. Whitelisted channels and categories exempt deletion of that channel or channels inside that category. SINCLAIR monitors channel deletion, role creation/deletion, member bans/kicks and pruning, bot additions, invite creation and posted Discord invite URLs, webhook deletion, dangerous permission grants, and assignment of roles with dangerous permissions. One matching action by a non-whitelisted member triggers the configured action immediately. Invite URLs in messages require the **Message Content Intent** to be enabled in the Discord Developer Portal. The bot needs **View Audit Log** and the permission for the selected action; its role must be high enough to moderate potential offenders. Role removal only affects roles Discord allows the bot to manage. `none` detects and logs events without automatically punishing the actor.

## Welcome Messages

Use `/welcome channel`, `/welcome message`, `/welcome status`, `/welcome disable`, and `/welcome preview` to manage welcome messages. `/set-welcome-channel` and `/set-welcome-message` are also available. Supported placeholders are `{user}`, `{username}`, `{server}`, and `{memberCount}`.

Use `/welcome embed edit` or `/edit-embed` to open the prefilled embed editor. Leave a field blank to clear it. `/welcome embed clear` clears all embed fields; select a field to clear only that field.

Welcome settings persist per server in `data/guild-welcome.json`. Enable the **Server Members Intent** and grant the bot permission to view and send messages in the welcome channel. Welcome configuration commands require **Manage Server**.

## Help and Tests

Use `/help` to list commands. Run the test suite with `npm test`.