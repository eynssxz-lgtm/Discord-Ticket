const { ChannelType } = require('discord.js');
const tempVoiceStore = require('./tempVoiceStore');

function parseChannelId(value) {
  const match = value.match(/^(?:<#(\d+)>|(\d+))$/);
  return match?.[1] || match?.[2] || null;
}

async function handleVoiceStateUpdate(oldState, newState, store = tempVoiceStore) {
  const guild = oldState.guild || newState.guild;
  const member = newState.member || oldState.member;
  if (!guild || !member || member.user.bot || oldState.channelId === newState.channelId) return;

  if (oldState.channelId && store.isTemporaryChannel(guild.id, oldState.channelId)
    && oldState.channel?.members?.size === 0) {
    await oldState.channel.delete('Temporary voice channel is empty').catch(() => null);
    store.removeTemporaryChannel(guild.id, oldState.channelId);
  }

  const config = store.getConfig(guild.id);
  if (!newState.channelId || newState.channelId !== config.triggerChannelId) return;

  const triggerChannel = newState.channel;
  const channel = await guild.channels.create({
    name: `${member.displayName}'s room`.slice(0, 100),
    type: ChannelType.GuildVoice,
    ...(triggerChannel.parentId ? { parent: triggerChannel.parentId } : {}),
  });
  store.addTemporaryChannel(guild.id, channel.id);

  try {
    await member.voice.setChannel(channel);
  } catch (error) {
    await channel.delete('Could not move member into temporary voice channel').catch(() => null);
    store.removeTemporaryChannel(guild.id, channel.id);
    throw error;
  }
}

module.exports = { parseChannelId, handleVoiceStateUpdate };