import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message } from 'whatsapp-web.js';
import { handleError, logMessage, tienePrefix } from './utils';
import { PromptData, PromptName, prompts } from './interfaces/chatinfo';

const prefixWenchotino = 'wenchotino';
const prefixBel = 'bel';
const prefixRoboto = 'roboto';
const prefixMulch= 'mulchquillota';

const gruposBeltranus = ['Familia B&G', 'Hermanitos'];
const gruposWenchotino = ['Corvo 👺'];
const gruposRoboto = ['Test 5'];

export class Beltranus {

  private prefix = 'bel';
  private commandPrefix = '-';
  private chatGpt: ChatGTP;
  private busy = false;
  private db: PostgresClient = PostgresClient.getInstance();

  public constructor() {
    this.chatGpt = new ChatGTP();
  }


  private async getPrompt(message: Message, chatData: Chat): Promise<PromptData | null> {

    const tieneWenchotino = tienePrefix(message.body, prompts[PromptName.WENCHOTINO].prefix);
    const tieneBel = tienePrefix(message.body, prompts[PromptName.BELTRANUS].prefix);
    const tieneRoboto = tienePrefix(message.body, prompts[PromptName.ROBOTO].prefix);
    const tieneMulch = tienePrefix(message.body, prompts[PromptName.MULCH].prefix);

    const meResponden = message.hasQuotedMsg ? (await message.getQuotedMessage()).fromMe : false;

    if(tieneBel || (meResponden && gruposBeltranus.includes(chatData.name)))
      return prompts[PromptName.BELTRANUS];
    else if(tieneMulch || (meResponden && gruposBeltranus.includes(chatData.name)))
      return prompts[PromptName.MULCH];
    else if(tieneWenchotino || (meResponden && gruposWenchotino.includes(chatData.name)))
      return prompts[PromptName.WENCHOTINO];
    else if(tieneRoboto || (meResponden && gruposRoboto.includes(chatData.name)) || !chatData.isGroup)
      return prompts[PromptName.ROBOTO];
    else
      return null;
  }

  public async readMessage(message: Message) {
    try {
      /** Se reciben datos de entrada */
      const chatData: Chat = await message.getChat();
      const tieneCommand = message.body.substring(0, 3) == this.commandPrefix+'a ';

      /** Se evalua si corresponde a algun bot */
      let prompt: PromptData = await this.getPrompt(message, chatData) as PromptData;
      if(prompt == null && !tieneCommand) return false;

      logMessage(message, chatData);

      /** Datos de contacto */
      const contactInfo = await message.getContact();

      /** Envia mensaje a ChatGPT */
      chatData.sendStateTyping();
      await this.chatGPTReply(message, message.body, contactInfo.name || 'Alguien', prompt);
      chatData.clearState();
      return true;
    } catch (e) {
      handleError(e, message);
    }
  }

  private async chatGPTReply(message: Message, messageContent: string, contactName: string, prompt: PromptData) {
    /** Obtiene Prompt*/

    /** Se setean variables que se usan en proceso */
    let mensajeParaBot = messageContent;

    /** Se obtienen datos de Prompt **/
    let promptInfo = await this.db.loadChatInfo(prompt.name, prompt.limit);

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

  // public async readMessage(message: Message) {
  //   try {
  //     let   esWenchotino = tienePrefix(message.body, prefixWenchotino);
  //     let   esBel = tienePrefix(message.body, prefixBel);
  //     let   esRoboto = tienePrefix(message.body, prefixRoboto);
  //
  //     const tieneCommand = message.body.substring(0, 3) == this.commandPrefix+'a ';
  //     let   prompt: PromptName = this.getPrompt(message.body);
  //
  //     const chatData: Chat = await message.getChat();
  //     const quotedMessage = await message.getQuotedMessage();
  //
  //
  //     // if(quotedMessage?.fromMe && (chatData.name == GrupoName.FAMILIA || chatData.name == GrupoName.TEST)){
  //     if(quotedMessage?.fromMe && (chatData.name == GrupoName.FAMILIA || chatData.name == GrupoName.TEST)){
  //       esBel = true;
  //       prompt = PromptName.BELTRANUS;
  //     }
  //
  //     if(!esWenchotino && !esBel && !esRoboto) return;
  //
  //     let messageContent = '';
  //     let contactInfo;
  //
  //     if (tieneCommand && !esBel) {
  //       const {command, content} = getMsgData(message);
  //       contactInfo = await message.getContact();
  //       return this.commandSelect(message, command, contactInfo.name || 'Alguien');
  //     }
  //
  //     messageContent = message.body;
  //
  //     logMessage(message, chatData);
  //
  //     contactInfo = await message.getContact();
  //     chatData.sendStateTyping();
  //     await this.chatGPTReply(message, messageContent, contactInfo.name || 'Alguien', prompt);
  //     chatData.clearState();
  //     return true;
  //   } catch (e) {
  //     handleError(e, message);
  //   }
  // }


}