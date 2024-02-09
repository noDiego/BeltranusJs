import { ChatGTP } from './chatgpt';
import { PostgresClient } from './database/postgresql';
import { Chat, Message, MessageMedia, MessageSendOptions } from 'whatsapp-web.js';
import { convertWavToMp3, getContactName, getMsgData, handleError, logMessage, parseCommand, tienePrefix } from './utils';
import * as path from 'path';
import * as fs from 'fs';
import { ChatCfg, GPTRol } from './interfaces/chatinfo';
import logger, { setLogLevel } from './logger';
import { CModel, CVoices, elevenTTS } from './eleven';
import { convertStreamToMessageMedia } from './ogg-convert';
import FakeyouService from './services/fakeyou';
import { FakeyouModel } from './interfaces/fakeyou.interfaces';
import { getCloudFile } from './http';
import { getMp3Message } from './services/google';
import { ChatCompletionContentPart } from 'openai/src/resources/chat/completions';

export class Beltranus {

  private chatGpt: ChatGTP;
  private busy = false;
  private db: PostgresClient = PostgresClient.getInstance();
  private chatConfigs: ChatCfg[];
  private fakeyouService: FakeyouService;

  public constructor() {
    this.chatGpt = new ChatGTP();
    this.fakeyouService = new FakeyouService();
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

      /** Si es un mensaje "Broadcast" no se procesa **/
      if(chatData.id.user == 'status' || chatData.id._serialized == 'status@broadcast') return false;

      /** Se evalua si corresponde a algun bot */
       let chatCfg: ChatCfg = await this.getChatConfig(message, chatData) as ChatCfg;

      if(chatCfg == null && !command) return false;

      logMessage(message, chatData);

      /** Datos de contacto del emisor del mensaje */
      const contactInfo = await message.getContact();

      /** Se evalua si debe enviar a flujo comandos **/
      if(!!command){
        await chatData.sendStateTyping();
        await this.commandSelect(message, contactInfo?.name || 'Alguien', chatCfg, chatData);
        await chatData.clearState();
        return true;
      }

      /** Envia mensaje a ChatGPT */
      chatData.sendStateTyping();
      const chatResponseString = await this.chatGPTReply(chatData, chatCfg);
      chatData.clearState();

      if(!chatResponseString) return;

      /** Se retorna mensaje */
      return message.reply(chatResponseString);
    } catch (e) {
      handleError(e, message);
    }
  }

  private async commandSelect(message: Message, contactName: string, chatCfg: ChatCfg, chatData: Chat) {
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
      case "fakeyou":
        if(message.body == '-fakeyou') return await this.fakeyouList(message);
        return await this.fakeyou(message, chatData);
      case "sp":
        return await this.eleven(message, CModel.SPANISH);
      case "en":
        return await this.eleven(message, CModel.ENGLISH);
      case "tts":
        return await this.ttsgoogle(message);
      default:
        return true;
    }
  }

  private async chatGPTReply(chatData: Chat, chatCfg: ChatCfg) {

    const actualDate = new Date();

    /**Se arma array de mensajes*/
    const messageList: any[] = [];

    /**Primer elemento será el mensaje de sistema*/
      messageList.push({role: GPTRol.SYSTEM, content: chatCfg.prompt_text});

    /**Se recorren los ultimos 'limit' mensajes para enviarlos en orden */
    const lastMessages = await chatData.fetchMessages({ limit: chatCfg.limit });
    for (const msg of lastMessages) {

      /** Se valida si el mensaje fue escrito hace menos de 24 horas, si es más antiguo no se considera **/
      const msgDate = new Date(msg.timestamp*1000);
      const diferenciaHoras = (actualDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60);
      if (diferenciaHoras > 24) continue;

      if(!msg.body && !msg.hasMedia) continue; //TODO: Identificar audios y transcribir a texto. Por mientras se omiten mensajes sin texto

      /** Se revisa si el mensaje incluye media**/
      const media = msg.hasMedia ? await msg.downloadMedia() : null;

      /** Si el mensaje es !nuevoTema o !n se considera historial solo de aqui en adelante **/
      if(msg.body == '!nuevoTema' || msg.body == '!n') {
        messageList.splice(1);
        continue;
      }

      const rol = msg.fromMe? GPTRol.ASSISTANT: GPTRol.USER;
      const name = msg.fromMe? 'assistant' : (await getContactName(msg));

      const content: string|Array<ChatCompletionContentPart> = [];
      if(msg.hasMedia && media) content.push({type: 'image_url',  "image_url": {
          "url": `data:image/jpeg;base64,${media.data}`
        }});
      if(msg.body) content.push({type: 'text', text: msg.body});


      messageList.push({role: rol, name: name, content: content});
    }

    /** Si no hay mensajes nuevos retorna sin accion **/
    if(messageList.length == 1) return;

    /** Se agrega preMessage a ultimo item*/
    if(chatCfg.premsg)
      messageList[messageList.length-1].content = (chatCfg.premsg+" "+messageList[messageList.length-1].content).trim();

    /** Se envia mensaje y se retorna texto de respuesta */
    return await this.chatGpt.sendMessages(messageList);
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

  private async fakeyouList(message: Message){
    const models = this.fakeyouService.getModelList();
    let msgModels = 'Ejemplo: "-fakeyou 8r1s06 hola soy wencho"\n\n'; // Incluye el mensaje de ejemplo en el primer mensaje.
    let messagesToSend: string[] = [];

    for (const model of models) {
      const newLine = `${model.model_token.replace('TM:', '').substring(0, 4)} - ${model.title}\n`;
      if (msgModels.length + newLine.length > 64000) {
        // Agrega el mensaje actual a la lista de mensajes a enviar.
        messagesToSend.push(msgModels);
        msgModels = newLine;
      } else {
        msgModels += newLine;
      }
    }

    if (msgModels.length > 0) {
      messagesToSend.push(msgModels);
    }

    for (const msg of messagesToSend) {
      await message.reply(msg);
    }

    return;
  }

  private async fakeyou(message: Message, chatData: Chat){
    const {command, content} = getMsgData(message);
    let texto = '';

    /** Se revisa el model ingresado **/
    let modelToken = content.split(' ')[0];

    /** Se revisa si hay un model entre comillas ingresado **/
    const coincidencias = content.match(/"([^"]*)"/);
    if (coincidencias) {
      modelToken = coincidencias[1];
      texto = content.split('"').slice(2).join('"').trim(); //Se genera el texto que se enviará para generar TTS
    }
    else texto = content.split(' ').slice(1).join(" "); //Se genera el texto que se enviará para generar TTS

    const titleWithSpaces = modelToken.replace('_',' ');
    const model: FakeyouModel = this.fakeyouService.getModelList().find(m => m.title.toLowerCase().includes(titleWithSpaces.toLowerCase())
      || m.title.toLowerCase().includes(modelToken.toLowerCase())
      || m.model_token.includes('TM:'+modelToken)) as FakeyouModel;

    logger.debug('Encontrado modelo:'+model.title);

    if(!model) {
      return message.reply(`No existe el model: ${modelToken}`);
    }

    /** Se evalua el texto escrito despues del model **/
    if(texto == '') { //Si no hay texto en el espacio para mensaje se tomará el último mensaje generado por el bot
      const lastBotMessage = await this.getLastBotMessage(chatData);
      texto = lastBotMessage
    }

    /** Se envia texto y model para generar audio **/
    try {
      logger.debug("Generando audio...");
      const audioURL = await this.fakeyouService.makeTTS(model, texto);

      /** Se procesa audio URL **/
      const streamAudio = await getCloudFile(String(audioURL));
      const streamMP3 = convertWavToMp3(streamAudio);

      logger.debug("Generacion de audio OK, Reproduciendo");

      const base64Audio = await convertStreamToMessageMedia(streamMP3);
      const filename = model.title.split('(')[0].trim()+".wav";
       const audioMedia = new MessageMedia('audio/wav', base64Audio, filename);
      //const audioMedia = await MessageMedia.fromUrl(base64Audio, { filename: filename })
      return await message.reply(audioMedia);

    }catch (e){
      logger.error(e);
      return await message.reply('No pude crear el audio ):');
    }
  }

  private async ttsgoogle(message: Message) {
    const {command, content} = getMsgData(message);
    let words = content.split(' ');
    const texto = words.slice(1).join(" ");
    if (words[0].toLowerCase() == 'piñera') words[0] = 'pinera';
    const voiceID = CVoices[words[0].toUpperCase()];

    //Generacion de Audio
    const responseData = await getMp3Message(content, 'FEMALE');
    //const oggStream = convertMp3StreamToOggOpus(audioRaw);

    const base64Audio = await convertStreamToMessageMedia(responseData.audioContent);

    const audioMedia = new MessageMedia('audio/mp3', base64Audio, 'test'+'.ogg');
    await message.reply(audioMedia);
  }

  private async getLastBotMessage(chatData: Chat) {
    const lastMessages = await chatData.fetchMessages({limit: 12});
    let lastMessageBot: string = '';
    for (const msg of lastMessages) {
      if(msg.fromMe && msg.body.length>1) lastMessageBot = msg.body;
    }
    return lastMessageBot;
  }

}
