import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message } from 'whatsapp-web.js';
import { getMsgData, handleError, logMessage, tienePrefix } from './utils';
import { PromptName } from './interfaces/chatinfo';

const prefixWenchotino = 'wenchotino';
const prefixBel = 'bel';
const prefixRoboto = 'roboto';

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
      const esWenchotino = tienePrefix(message.body, prefixWenchotino);
      const esBel = tienePrefix(message.body, prefixBel);
      const esRoboto = tienePrefix(message.body, prefixRoboto);
      const tieneCommand = message.body.substring(0, 3) == this.commandPrefix+'a ';

      if(!esWenchotino && !esBel && !esRoboto) return;

      const prompt: PromptName = this.getPrompt(message.body);

      const chatData: Chat = await message.getChat();
      const quotedMessage = await message.getQuotedMessage();
      let messageContent = '';
      let contactInfo;

      if (tieneCommand && !esBel) {
        const {command, content} = getMsgData(message);
        contactInfo = await message.getContact();
        return this.commandSelect(message, command, contactInfo.name || 'Alguien');
      }

      messageContent = message.body;

      logMessage(message, chatData);

      contactInfo = await message.getContact();
      chatData.sendStateTyping();
      await this.chatGPTReply(message, messageContent, contactInfo.name || 'Alguien', prompt);
      chatData.clearState();
      return true;
    } catch (e) {
      handleError(e, message);
    }
  }

  private async chatGPTReply(message: Message, messageContent: string, contactName: string, prompt: PromptName) {
    /** Obtiene Prompt*/

    /** Se setean variables que se usan en proceso */
    let mensajeParaBot = messageContent;

    /** Se obtienen datos de Prompt **/
    let promptInfo = await this.db.loadChatInfo(prompt, prompt == PromptName.BELTRANUS? 20: 10);

    /**Enviando mensaje y obteniendo respuesta */
    const responseChat = await this.chatGpt.sendMessage(contactName, mensajeParaBot, promptInfo);

    /** Respondiendo*/
    return await message.reply(responseChat);
  }

  private getPrompt(msg: string): PromptName{
    const esWenchotino = tienePrefix(msg, prefixWenchotino);
    const esBel = tienePrefix(msg, prefixBel);
    const esRoboto = tienePrefix(msg, prefixRoboto);

    if(esWenchotino) return PromptName.WENCHOTINO;
    else if(esBel) return PromptName.BELTRANUS;
    else return PromptName.ROBOTO;
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