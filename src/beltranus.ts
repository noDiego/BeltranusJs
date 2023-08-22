import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message, MessageMedia, MessageSendOptions } from 'whatsapp-web.js';
import { getContactName, getMsgData, handleError, logMessage, parseCommand, tienePrefix } from './utils';
import * as path from 'path';
import * as fs from 'fs';
import { ChatCfg, GPTRol } from './interfaces/chatinfo';
import logger, { setLogLevel } from './logger';
import { ChatCompletionRequestMessage } from 'openai/api';
import { CModel, CVoices, elevenTTS } from './eleven';
import { convertStreamToMessageMedia } from './ogg-convert';

export class Beltranus {

  private chatGpt: ChatGTP;
  private busy = false;
  private db: PostgresClient = PostgresClient.getInstance();
  private chatConfigs: ChatCfg[];

  public constructor() {
    this.chatGpt = new ChatGTP();
    this.loadChatConfigs().then(()=>{logger.info('ChatConfigs Loaded')});
  }

  private async loadChatConfigs(){
    const chatConfigs = await this.db.loadChatConfigs();
    /**Se retorna arreglo con los "*" al final */
    this.chatConfigs = chatConfigs.sort((a, b) => (a.groups === '*' ? 1 : b.groups === '*' ? -1 : 0));
  }

  private async getChatConfig(message: Message, chatData: Chat): Promise<ChatCfg | null>{
    /** Se recorre configuraciones guardadas */
    for (const chatCfg of this.chatConfigs) {
      /**Revisa si el mensaje viene del grupo de la config */
      const grupoCoincide = chatData.isGroup && chatCfg.groups.split('|').includes(chatData.name);
      /**Revisa si el mensaje incluye el prefix de la config */
      const prefixCoincide = tienePrefix(message.body, chatCfg.prefix);
      /**Revisa si le estan respondiendo */
      const meResponden = message.hasQuotedMsg ? (await message.getQuotedMessage()).fromMe : false;

      /** Se retorna config si pertenece al grupo y si el prefix coincide o si le estan respondiendo */
      if(grupoCoincide && (prefixCoincide || meResponden)) return chatCfg;
      /** Caso para bots que pueden ser invocados en cualquier momento a traves de su nombre **/
      if(prefixCoincide && chatCfg.groups == '-') return chatCfg;
      /** Si no coincide ningun otro, se retornará la config que coincida con la config de group "*" y este usando el prefix correspondiente */
      if(chatCfg.groups == '*' && (prefixCoincide || meResponden || !chatData.isGroup)) return chatCfg;
    }
    return null;
  }

  public async readMessage(message: Message) {
    try {
      /** Se reciben datos de entrada (Se extrae command ej: -a , y se extra mensaje */
      const chatData: Chat = await message.getChat();
      const { command, commandMessage } = parseCommand(message.body);

      /** Se evalua si corresponde a algun bot */
      let chatCfg: ChatCfg = await this.getChatConfig(message, chatData) as ChatCfg;
      if(chatCfg == null && !command) return false;

      logMessage(message, chatData);

      /** Datos de contacto del emisor del mensaje */
      const contactInfo = await message.getContact();

      /** Se evalua si debe enviar a flujo comandos **/
      if(!!command){
        await chatData.sendStateTyping();
        await this.commandSelect(message, contactInfo?.name || 'Alguien', chatCfg);
        await chatData.clearState();
        return true;
      }

      /** Envia mensaje a ChatGPT */
      chatData.sendStateTyping();
      const chatResponseString = await this.chatGPTReply(chatData, chatCfg);
      chatData.clearState();

      /** Se retorna mensaje */
      return message.reply(chatResponseString);
    } catch (e) {
      handleError(e, message);
    }
  }

  private async chatGPTReply(chatData: Chat, chatCfg: ChatCfg) {

    /**Se arma array de mensajes*/
    const messageList: ChatCompletionRequestMessage[] = [];

    /**Primer elemento será el mensaje de sistema*/
    messageList.push({role: GPTRol.SYSTEM, content: chatCfg.prompt_text});

    /**Se recorren los ultimos 'limit' mensajes para enviarlos en orden */
    const lastMessages = await chatData.fetchMessages({ limit: chatCfg.limit });
    for (const msg of lastMessages) {

      if(!msg.body) continue; //TODO: Identificar audios y transcribir a texto. Por mientras se omiten mensajes sin texto

      const rol = msg.fromMe? GPTRol.ASSISTANT: GPTRol.USER;
      const name = msg.fromMe? undefined : (await getContactName(msg));
      const contentMsg = msg.fromMe? '<Respuesta generada por Bot GPT>' : msg.body;
      messageList.push({role: rol, name: name, content: contentMsg});
    }

    /** Se agrega preMessage a ultimo item*/
    if(chatCfg.premsg)
      messageList[messageList.length-1].content = (chatCfg.premsg+" "+messageList[messageList.length-1].content).trim();

    /** Se envia mensaje y se retorna texto de respuesta */
    return await this.chatGpt.sendMessages(messageList);
  }



  private async commandSelect(message: Message, contactName: string, chatCfg: ChatCfg) {
    const { command, commandMessage } = parseCommand(message.body);
    switch (command) {
      case "a":
        return await this.customMp3(message, <string> commandMessage);
      case "setLogLevel":
        setLogLevel(commandMessage == 'debug' ? 'debug': 'info');
        return message.reply(`Log Level: "${commandMessage}"`);
      case "reloadConfig":
        await this.loadChatConfigs();
        return message.reply('Reload OK');
      case "sp":
        return await this.eleven(message, CModel.SPANISH);
      case "en":
        return await this.eleven(message, CModel.ENGLISH);
      default:
        return true;
    }
  }

  private async customMp3(message: Message, commandMessage: string) {
    const mp3Folder = __dirname + "/../ogg/";

    if(!commandMessage || commandMessage == ''){
      let msgAudios = '-a ';
      fs.readdir(mp3Folder, function (err, files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          msgAudios = msgAudios + file.replace('.ogg', '') + ((i + 1) == files.length ? "" : "\n-a ")
        }
        message.reply(msgAudios);
      });
      return;
    }

    const pathNormalized = path.normalize(mp3Folder + commandMessage + ".ogg");

    // enviar el archivo de audio como un mensaje de audio
    const audioBuffer = fs.readFileSync(pathNormalized);
    const base64Audio = audioBuffer.toString('base64');

    // Crear un objeto MessageMedia a partir del audio
    const audioMedia = new MessageMedia('audio/ogg; codecs=opus', base64Audio, commandMessage+'.ogg');

    const messageOptions: MessageSendOptions = { sendAudioAsVoice: true };
    return await message.reply(audioMedia, undefined,  messageOptions);
  }

  private async eleven(message: Message, model: CModel) {
    const {command, content} = getMsgData(message);
    let words = content.split(' ');
    const texto = words.slice(1).join(" ");
    if (words[0].toLowerCase() == 'piñera') words[0] = 'pinera';
    const voiceID = CVoices[words[0].toUpperCase()];

    //Generacion de Audio
    const audioRaw: boolean | string = await elevenTTS(voiceID, texto, model);
    //const oggStream = convertMp3StreamToOggOpus(audioRaw);

    const base64Audio = await convertStreamToMessageMedia(audioRaw);


    const audioMedia = new MessageMedia('audio/mp3', base64Audio, 'test'+'.ogg');
    await message.reply(audioMedia);
  }

}