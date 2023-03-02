import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message } from 'whatsapp-web.js';
import { getMsgData, handleError, logMessage } from './utils';

export class Wenchotino {

  private prefix = 'bot ';
  private commandPrefix = '-';
  private chatGpt: ChatGTP;
  private busy = false;
  private db: PostgresClient = PostgresClient.getInstance();

  public constructor() {
    this.chatGpt = new ChatGTP();
  }

  public async readMessage(message: Message) {
    try {
      const chatData: Chat = await message.getChat();
      const quotedMessage = await message.getQuotedMessage();
      let messageContent = '';

      const tienePrefix = message.body.substring(0,4).toLowerCase() == this.prefix;
      const tieneCommandPrefix = message.body.substring(0,1) == this.commandPrefix;
      const meResponden = message.hasQuotedMsg && quotedMessage.fromMe;
      const esGrupo = chatData.isGroup;

      if(tieneCommandPrefix){
        const {command, content} = getMsgData(message);
        return this.commandSelect(message, command);
      }
      else if(meResponden || (esGrupo && tienePrefix)){
        messageContent = tienePrefix? message.body.slice(4) : message.body;
      }
      else if(esGrupo) return true;
      else {
        messageContent = tienePrefix? message.body.slice(4) : message.body;
      }

      logMessage(message, chatData);

      await this.commandSelect(message, messageContent);
      return true;
    } catch (e) {
      handleError(e, message);
    }
  }

  private async commandSelect(message: Message, command: string) {
    switch (command) {
      case "-a":
        return await this.customMp3(message);
      default:
        return true;
    }
  }

  private async customMp3(message) {
    return await message.reply('mp3');
  }



}