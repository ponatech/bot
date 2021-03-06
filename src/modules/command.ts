import {
  ICommandOptions,
  Permission,
  IBotMessage,
  CommandMetadata,
  IBotClient,
} from '../interfaces';
import Collection from '@discordjs/collection';
import { Snowflake } from 'discord.js';

/**
 * Represents a command.
 * @example
 * module.exports = new Command({
 *   name: 'hello',
 *   description: 'Says hello back to you.',
 *   category: 'greeting',
 *   aliases: ['hi'],
 *   run(message, args, call) {
 *     message.channel.send(`Hello ${message.author}!`);
 *   },
 * });
 */
export class Command<T = {[key: string]: any}> implements ICommandOptions<T> {
  name: ICommandOptions<T>['name'] = '';
  description: ICommandOptions<T>['description'] = '';
  usage: ICommandOptions<T>['usage'] = '';
  run: ICommandOptions<T>['run'] = () => {};
  aliases: ICommandOptions<T>['aliases'] = [];
  permission: ICommandOptions<T>['permission'] = 0;
  cooldown: ICommandOptions<T>['cooldown'] = 3;
  runIn: ICommandOptions<T>['runIn'] = ['text'];
  hidden: ICommandOptions<T>['hidden'] = false;
  requiredArgs: ICommandOptions<T>['requiredArgs'] = [];
  examples: ICommandOptions<T>['examples'] = [];
  category: ICommandOptions<T>['category'] = 'other';
  delete: ICommandOptions<T>['delete'] = false;
  init: ICommandOptions<T>['init'] = () => {};
  shutdown: ICommandOptions<T>['shutdown'] = () => {};
  send!: ICommandOptions<T>['send'];

  static readonly Permission = Permission;

  /**
   * @param {ICommandOptions<T>} options={} The options for this command.
   */
  constructor(options: ICommandOptions<T>) {
    if (!('name' in options)) {
      throw new TypeError('A command must have a name.');
    }
    if (!('description' in options)) {
      throw new TypeError('A command must have a description.');
    }
    if (!('run' in options)) {
      throw new TypeError('A command must have a handler function.');
    }
    Object.assign(this, options);
  }
}

/**
 * Splits a command call into the command name and its arguments.
 * @param {string} content The message's content.
 * @param {string} prefix The prefix used.
 * @example
 * splitArguments('!hello there friend', '!'); -> {name: 'hello', args: ['there', 'friend']}
 */
export const splitArguments = (
  content: string,
  prefix: string,
): { command: string | undefined; args: string[] } => {
  const args = content
    .trim()
    .substr(prefix.length)
    // collapse spaces
    .replace(/(\s\s+|\n)/g, ' ')
    .split(/ +/);
  const command = args
    .shift()
    ?.trim()
    .toLowerCase();
  return {
    command,
    args,
  };
};

/**
 * ! Command Parsing
 */

/**
 * Validates whether this message starts with the default prefix or if it matches
 * a custom prefix set by the guild it comes from.
 * @returns {string|false} Returns the prefix or false if check failed.
 */
export const validatePrefix = (
  message: IBotMessage,
  defaultPrefix: string,
  guildPrefixes?: Map<string, any>,
): string | false => {
  const content = message.content
    .trim()
    .toLowerCase()
    .replace(/\s\s+/g, ' ');

  // return truthy if no guildPrefixes map provided and command starts with prefix
  if (!guildPrefixes) {
    return content.startsWith(defaultPrefix) ? defaultPrefix : false;
  }

  const guildId = message.guild?.id;
  // If guild prefix equals default prefix that should not be treated as a custom prefix.
  const customPrefix =
    guildPrefixes.get(guildId!)?.prefix === defaultPrefix
      ? false
      : guildPrefixes.get(guildId!)?.prefix;

  // do not run command with normal prefix if a custom prefix is set
  if (customPrefix && content.startsWith(defaultPrefix)) {
    return false;
  }

  // has custom prefix and command starts with it
  if (customPrefix && content.startsWith(customPrefix)) {
    return customPrefix;
  }

  // does not have custom prefix and command starts with default prefix
  if (!customPrefix && content.startsWith(defaultPrefix)) {
    return defaultPrefix;
  }

  // false if doesn't start with correct prefix
  return false;
};

export const buildCommandMetadata = (
  bot: IBotClient,
  message: IBotMessage,
  prefix: string,
): CommandMetadata => {
  const meta = {} as CommandMetadata;

  // Known props
  meta.isDM = message.channel.type === 'dm';
  meta.userId = message.author.id;
  meta.tag = message.author.tag;
  meta.username = message.author.username;
  meta.nickname = message.member?.nickname ?? null;
  meta.guild = message.guild;
  meta.message = message;
  meta.time = new Date();
  meta.permLevel = bot.permlevel(message);

  const { command, args } = splitArguments(message.content, prefix);

  let cmd = bot.commands.get(command!);
  let isAlias = false;
  if (!cmd && bot.aliases.has(command!)) {
    isAlias = true;
    cmd = bot.commands.get(bot.aliases.get(command!)!);
  }

  // Unknown props
  meta.command = cmd ?? null;
  meta.commandName = cmd?.name ?? null;
  meta.calledByAlias = isAlias;
  meta.args = args;
  meta.content = args
    .slice(cmd?.requiredArgs?.length ?? 0)
    .join(' ')
    .trim(); // slice to skip required args
  meta.contentFull = args.join(' ').trim(); // slice to skip required args
  // puts the name of the first missing arg in missingArg
  if (cmd?.requiredArgs?.length ?? 0 > args.length) {
    meta.missingArg = cmd?.requiredArgs?.[args.length] ?? null;
  } else {
    meta.missingArg = null;
  }

  meta.prefix = prefix;

  return meta;
};

/**
 * ! Command Running
 */

export class CooldownManager extends Collection<string, Collection<Snowflake, number>> {
  bot: IBotClient;

  constructor(bot: IBotClient) {
    super();
    if (!bot) throw new Error('CooldownManager needs a client.');
    this.bot = bot;
  }

  loadCommands(commands: IBotClient['commands']) {
    commands.forEach(cmd => {
      super.set(cmd.name.toLowerCase(), new Collection());
    });
  }

  updateTimeLeft(commandName: string, userId: Snowflake) {
    if (!this.bot.commands.has(commandName)) {
      throw new Error(`Could not update cooldown because command ${commandName} was not found.`);
    }
    const now = Date.now();
    const timestamps = super.get(commandName);
    if (timestamps) {
      timestamps.set(userId, now);
    } else {
      throw new Error(
        `Could not update cooldown because there was no collection for the command ${commandName}.`,
      );
    }
  }

  getTimeLeft(commandName: string, userId: Snowflake): number {
    if (!this.bot.commands.has(commandName)) {
      throw new Error(
        `Could not get cooldown left for user ${userId} because "${commandName}" was not in the bot.commands collection.`,
      );
    }
    const cmd = this.bot.commands.get(commandName)!;
    const now = Date.now();
    const cooldownAmount = (cmd.cooldown ?? 3) * 1000;

    const timestamps = super.get(commandName);
    if (!timestamps) {
      throw new Error(
        `Could not get cooldown left for user ${userId} because there was no timestamps collection for the command ${commandName}.`,
      );
    }
    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)! + cooldownAmount;
      if (now < expirationTime) {
        // Return seconds left
        return Number(((expirationTime - now) / 1000).toFixed(1));
      }
      return 0;
    }
    // User haven't used the command yet, add them to the collection
    this.updateTimeLeft(commandName, userId);
    this.bot.setTimeout(() => timestamps.delete(userId), cooldownAmount);
    return 0;
  }
}
