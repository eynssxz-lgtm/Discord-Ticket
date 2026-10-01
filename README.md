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
/set logs channel:#deleted-images type:image-delete
/set logs channel:#deleted-messages type:message-delete
/set temp-voice channel:#create-room
/set temp-voice
```

`/set logs channel:#mod-logs` sets the fallback for all log types. Use `/set logs channel:#deleted-images type:image-delete` (or `message-delete`, `video-delete`, `voice`, or `security`) to route a type separately; `/set logs type:image-delete` clears that override.

The bot routes voice activity, deleted text, images, videos, and antinuke/security events to their configured channels. Members joining the temporary voice trigger channel are moved to a new channel in the same category when applicable. Each generated room receives a control panel in its voice chat with lock/unlock, hide/show, rename, claim, user limit, info, and delete controls. The room creator owns the controls; a member can claim the room after its owner leaves. Empty temporary channels are deleted automatically. The bot needs **Manage Channels**, **Manage Roles** (for room overwrites), **Move Members**, and permission to send messages in voice channels.

## Moderation

Use `/afk [reason]` to set a per-server AFK status. Your status clears the next time you send a message; members who mention you see the saved reason.

Moderation commands include `/kick`, `/ban`, `/timeout`, `/mute`, `/purge`, `/jail`, `/unjail`, `/role add`, `/avatar`, and `/cover`. For example:

```text
/kick member:@member reason:spam
/timeout member:@member duration:10m reason:spam
/purge amount:25
/jail member:@member
/role add member:@member role:@Role
```

You can also use `/role add member role` or `,role add <user ID or mention> <role name, ID, or mention>`. Role names with spaces are supported, for example `,role add 123456789012345678 Senior Support`.

The same actions are available under `/mod` subcommands where applicable. Role assignment requires **Manage Roles** for both the command user and bot, with the bot's highest role above the target member and selected role. You can select a member by mention or user picker.

Configure the jail role with `/set jail-role role:@Jailed`. Jailing removes the member's assigned roles and applies the jail role; unjailing removes that role and restores saved roles that still exist. Role snapshots and the configured jail role are stored in `data/guild-jails.json`. Configure the jail role's channel permissions separately.

## Tickets

Run `/ticket setup` in a text channel to configure the panel title and description. You can optionally choose a panel channel, ticket category, and support role. The panel's **Create Ticket** button opens one private text channel per user; the requester and support role can see it, and the ticket's **Close Ticket** button removes it. The bot needs **Manage Channels**, **Manage Roles**, and permission to send messages in the panel channel.

## NSFW Invite Links

Use `/antinsfw server link enabled:true` to block posted Discord invites that resolve to age-restricted channels; use `enabled:false` to turn the filter off. The bot only deletes a link when Discord confirms the invite's destination is NSFW. The bot must be able to delete messages in the channel.

## Autoresponders

Members with **Manage Server** can add exact-match autoresponders:

```text
/autoresponder add trigger:hello response:Hi there!
/autoresponder list
/autoresponder remove trigger:hello
```

Triggers are case-insensitive and saved per server in `data/guild-autoresponders.json`. Autoresponders continue to match ordinary messages; commands themselves use slash interactions.

## Antinuke

Antinuke is disabled by default. Members with **Manage Server** can use `/antinuke setup` for the interactive settings panel, or `/antinuke enable`, `/antinuke disable`, and `/antinuke status`. New configurations default to removing all manageable roles after one matching action. Choose a global response with `/antinuke set-punishment`; override individual action groups with `/antinuke set-action-punishment action punishment`. Supported responses are `remove-roles`, `timeout`, `kick`, `ban`, and `none`.

Join-raid protection is separate and disabled by default. Configure it with `/antinuke raid-config enabled:true threshold:5 window-seconds:10 punishment:kick`.

Whitelist actors and targets with the `/antinuke whitelist-role`, `/antinuke whitelist-category`, and `/antinuke whitelist-channel` command groups. Each group provides `add`, `remove`, and `list` subcommands. `/antinuke whitelist-list` shows all exemptions.

Whitelisted roles exempt their members from penalties. Whitelisted channels and categories exempt deletion of that channel or channels inside that category. Protections include channel creation/deletion, role creation/deletion, member bans/kicks/pruning, bot additions, invite changes and posted invite URLs, webhook/integration changes, bulk message deletions, emoji/sticker changes, thread deletion, dangerous permission grants, and dangerous-role assignment. One matching action triggers its configured response immediately. Join-raid protection only acts on members joining after its configured threshold is reached. Invite URLs in messages require the **Message Content Intent** in the Discord Developer Portal. The bot needs **View Audit Log** and each configured punishment permission; role removal only affects roles Discord allows the bot to manage. `none` detects and logs without punishing.

## Welcome Messages

Use `/welcome channel`, `/welcome message`, `/welcome status`, `/welcome disable`, and `/welcome preview` to manage welcome messages. `/set-welcome-channel` and `/set-welcome-message` are also available. Variables work in the welcome message and embed title, description, author, footer, image, and thumbnail:

- User: `{user}` / `{user.mention}`, `{username}`, `{user.name}`, `{user.username}`, `{user.displayName}`, `{user.id}`, `{user.avatar}`, `{user.createdAt}`, `{user.joinedAt}`
- Server: `{server}` / `{server.name}`, `{server.id}`, `{server.memberCount}`, `{memberCount}`, `{server.icon}`
- Welcome channel: `{channel.name}`, `{channel.id}`

Timestamps render as Discord timestamps and display in each viewer's local time. Variables in image URLs are substituted before the embed is sent.

Use `/welcome embed edit` or `/edit-embed` to open the prefilled embed editor. Leave a field blank to clear it. `/welcome embed clear` clears all embed fields; select a field to clear only that field.

Welcome settings persist per server in `data/guild-welcome.json`. Enable the **Server Members Intent** and grant the bot permission to view and send messages in the welcome channel. Welcome configuration commands require **Manage Server**.

## Help and Tests

Use `/help` to list commands. Run the test suite with `npm test`.