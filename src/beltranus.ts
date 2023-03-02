import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message } from 'whatsapp-web.js';
import { getMsgData, handleError, logMessage, tienePrefix } from './utils';
import { PromptName } from './interfaces/chatinfo';
import logger from './logger';

export class Beltranus {

  private prefix = 'bel';
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
      let contactInfo;

      const tieneNombre = tienePrefix(message.body.toLowerCase(), this.prefix.toLowerCase());

      const tieneCommandPrefix = message.body.substring(0, 1) == this.commandPrefix;
      const meResponden = message.hasQuotedMsg && quotedMessage.fromMe;
      const esGrupo = chatData.isGroup;

      if (tieneCommandPrefix) {
        const {command, content} = getMsgData(message);
        contactInfo = await message.getContact();
        return this.commandSelect(message, command, contactInfo.name || 'Alguien');
      } else if (meResponden || (esGrupo && tieneNombre)) {
        messageContent = tieneNombre ? message.body.slice(4) : message.body;
      } else if (esGrupo) return true;
      else {
        messageContent = message.body;
      }

      logMessage(message, chatData);

      contactInfo = await message.getContact();
      chatData.sendStateTyping();
      await this.chatGPTReply(message, messageContent, contactInfo.name || 'Alguien');
      chatData.clearState();
      return true;
    } catch (e) {
      handleError(e, message);
    }
  }

  private async chatGPTReply(message: Message, messageContent: string, contactName: string) {
    /** Se setean variables que se usan en proceso */
    let mensajeParaBot = messageContent;

    /** Se obtienen datos de Prompt **/
    let promptInfo = await this.db.loadChatInfo(PromptName.BELTRANUS, 30);

    /**Enviando mensaje y obteniendo respuesta */
    const responseChat = await this.chatGpt.sendMessage(contactName, mensajeParaBot, promptInfo);

    /** Respondiendo*/
    return await message.reply(responseChat);

  }

  private async commandSelect(message: Message, command: string, contactName: string) {
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