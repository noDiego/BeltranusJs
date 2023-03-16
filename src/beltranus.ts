import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message, MessageMedia } from 'whatsapp-web.js';
import { filtraJailbreak, handleError, logMessage, parseCommand, removeNonAlphanumeric, tienePrefix } from './utils';
import { GrupoName, PromptData, PromptName, prompts } from './interfaces/chatinfo';
import path from 'path';
import * as fs from 'fs';

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
    const tieneBirdo = tienePrefix(message.body, prompts[PromptName.BIRDOS].prefix);
    const tieneDan = tienePrefix(message.body, prompts[PromptName.DAN].prefix);

    const meResponden = message.hasQuotedMsg ? (await message.getQuotedMessage()).fromMe : false;

    if(tieneBel || (meResponden && gruposBeltranus.includes(chatData.name)))
      return prompts[PromptName.BELTRANUS];
    else if(tieneBirdo || (meResponden && GrupoName.BIRDITOS.includes(chatData.name.substring(0,5))))
      return prompts[PromptName.BIRDOS];
    else if(tieneMulch || (meResponden && gruposBeltranus.includes(chatData.name)))
      return prompts[PromptName.MULCH];
    else if(tieneWenchotino || (meResponden && gruposWenchotino.includes(chatData.name)))
      return prompts[PromptName.WENCHOTINO];
    else if(tieneDan)
      return prompts[PromptName.DAN];
    else if(tieneRoboto || (meResponden && gruposRoboto.includes(chatData.name)) || !chatData.isGroup)
      return prompts[PromptName.ROBOTO];
    else
      return null;
  }

  public async readMessage(message: Message) {
    try {
      /** Se reciben datos de entrada */
      const chatData: Chat = await message.getChat();
      const { command, commandMessage } = parseCommand(message.body);

      /** Se evalua si corresponde a algun bot */
      let prompt: PromptData = await this.getPrompt(message, chatData) as PromptData;
      if(prompt == null && !command) return false;

      logMessage(message, chatData);

      /** Datos de contacto */
      const contactInfo = await message.getContact();

      /** Envia audios **/
      if(command && prompt.name == PromptName.WENCHOTINO){
        chatData.sendStateTyping();
        await this.commandSelect(message, contactInfo.name || 'Alguien', prompt);
        chatData.clearState();
        return true;
      }

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
    let responseChat = await this.chatGpt.sendMessage(removeNonAlphanumeric(contactName), mensajeParaBot, promptInfo);

    /**Filtra mensaje si es DAN */
    responseChat = filtraJailbreak(responseChat);

    /** Respondiendo*/
    return await message.reply(responseChat);
  }


  private async commandSelect(message: Message, contactName: string, prompt: PromptData) {
    const { command, commandMessage } = parseCommand(message.body);
    switch (command) {
      case "a":
        return await this.customMp3(message, <string> commandMessage);
      default:
        return true;
    }
  }

  private async customMp3(message: Message, commandMessage: string) {
    const mp3Folder = __dirname + "/../mp3/";

    if(!commandMessage || commandMessage == ''){
      let msgAudios = '-a ';
      fs.readdir(mp3Folder, function (err, files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          msgAudios = msgAudios + file.replace('.mp3', '') + ((i + 1) == files.length ? "" : "\n-a ")
        }
      });
      return message.reply(msgAudios);
    }

    const pathNormalized = path.normalize(mp3Folder + commandMessage + ".mp3");

    // enviar el archivo de audio como un mensaje de audio
    const audioBuffer = fs.readFileSync(pathNormalized);
    const base64Audio = audioBuffer.toString('base64');

    // Crear un objeto MessageMedia a partir del audio
    const audioMedia = new MessageMedia('audio/mp3', base64Audio, commandMessage+'.mp3');

    const chat = await message.getChat();
    return await chat.sendMessage(audioMedia);
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