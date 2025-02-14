import { ChatGTP } from './services/chatgpt';
import { Chat, Contact, Message, MessageMedia, MessageSendOptions, MessageTypes } from 'whatsapp-web.js';
import {
  bufferToStream,
  capitalizeString,
  convertStreamToMessageMedia,
  convertWavToMp3,
  getCloudFile,
  getContactName,
  getMsgData, getUnsupportedMessage,
  includePrefix,
  logMessage,
  parseCommand
} from './utils';
import logger from './logger';
import OpenAI from 'openai';
import FakeyouService from './services/fakeyou';
import { PostgresClient } from './database/postgresql';
import { ChatCfg } from './interfaces/chatinfo';
import { CONFIG } from './config';
import { CVoices, elevenTTS } from './services/eleven';
import * as fs from 'fs';
import path from 'path';
import { FakeyouModel } from './interfaces/fakeyou.interfaces';
import { AiContent, AiLanguage, AiMessage, AiRole } from './interfaces/ai-message';
import { Claude } from './services/claude';
import { ChatCompletionMessageParam } from 'openai/resources';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeModel } from './interfaces/claude-model';
import NodeCache from 'node-cache';
import ChatCompletionContentPart = OpenAI.ChatCompletionContentPart;
import MessageParam = Anthropic.MessageParam;
import ImageBlockParam = Anthropic.ImageBlockParam;
import TextBlock = Anthropic.TextBlock;

export class Beltranus {

  private client;
  private chatGpt: ChatGTP;
  private claude: Claude;
  private fakeyouService: FakeyouService;
  private db: PostgresClient;
  private chatConfigs: ChatCfg[];
  private allowedTypes = [MessageTypes.STICKER, MessageTypes.TEXT, MessageTypes.IMAGE, MessageTypes.VOICE, MessageTypes.AUDIO];
  private aiConfig = {
    aiLanguage: AiLanguage.OPENAI,
    model: ClaudeModel.SONNET
  };
  private imageTokens = 255; //Tokens Image 512x512
  private cache: NodeCache;
  private groupProcessingStatus: {[key: string]: boolean} = {}; //Para validar que el chat en un grupo no este "ocupado" respondiendo otro mensaje

  public constructor(client) {
    this.client = client;
    this.cache = new NodeCache();
    this.chatGpt = new ChatGTP();
    this.claude = new Claude();
    this.fakeyouService = new FakeyouService();
    this.db = PostgresClient.getInstance();
    this.loadChatConfigs().then(()=>{logger.info('ChatConfigs Loaded')});
  }

  private async loadChatConfigs(){
    const chatConfigs = await this.db.loadChatConfigs();
    /**Se retorna arreglo con los "*" al final */
    this.chatConfigs = chatConfigs.sort((a, b) => (a.groups === '*' ? 1 : b.groups === '*' ? -1 : 0));
  }

  private async getChatConfig(message: Message, chatData: Chat, isCreatorPersonalChat: boolean): Promise<ChatCfg | null>{
    //Si soy yo hablando directo retorna Tars
    if(isCreatorPersonalChat) return this.chatConfigs.find(p=> p.prompt_name.toLowerCase() == 'tars') as ChatCfg;

    /** Se recorre configuraciones guardadas */
    for (const chatCfg of this.chatConfigs) {
      /**Revisa si el mensaje viene del grupo de la config */
      const grupoCoincide = chatData.isGroup && chatCfg.groups.split('|').includes(chatData.name);
      /**Revisa si el mensaje incluye el prefix de la config */
      const prefixCoincide = includePrefix(message.body, chatCfg.prefix);
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

  /**
   * Handles incoming WhatsApp messages and decides the appropriate action.
   * This can include parsing commands, replying to direct mentions or messages, or sending responses through the ChatGPT AI.
   *
   * The function first checks for the type of message and whether it qualifies for a response based on certain criteria,
   * such as being a broadcast message, a direct mention, or containing a specific command.
   *
   * If the message includes a recognized command, the function dispatches the message for command-specific handling.
   * Otherwise, it constructs a prompt for the ChatGPT AI based on recent chat messages and sends a response back to the user.
   *
   * The function supports special actions like generating images or synthesizing speech based on the content of the message.
   *
   * Parameters:
   * - message: The incoming Message object from the WhatsApp Web.js library that encapsulates all data and operations relevant to the received WhatsApp message.
   *
   * Returns:
   * - A promise that resolves to a boolean value indicating whether a response was successfully sent back to the user or not.
   */
  public async readMessage(message: Message) {

    const chatData: Chat = await message.getChat();

    try {
      const contactData: Contact = await message.getContact();
      const { command, commandMessage } = parseCommand(message.body);
      const isSuperUser = contactData.number == CONFIG.botConfig.personalNumber;
      const isSuperUserChat = isSuperUser && !chatData.isGroup;

      //Numeros restringidos
      if(CONFIG.botConfig.restrictedNumbers.includes(contactData.number)){
        logger.info(`Numero ${contactData.number} en lista restringida. Se ignora mensaje`);
        return false;
      }

      // If it's a "Broadcast" message, it's not processed
      if(chatData.id.user == 'status' || chatData.id._serialized == 'status@broadcast') return false;

      if(!this.allowedTypes.includes(message.type) || message.type == MessageTypes.AUDIO) return false;

      // Se evalua si corresponde a algun bot
      let chatCfg: ChatCfg = await this.getChatConfig(message, chatData, isSuperUserChat) as ChatCfg;
      if(chatCfg == null && !command) return false;

      // Logs the message
      logMessage(message, chatData, contactData);

      // Evaluates if it should go to the command flow
      if(!!command){
        await chatData.sendStateTyping();
        await this.commandSelect(message, chatData, chatCfg, isSuperUser);
        await chatData.clearState();
        return true;
      }

      // Verifica si ya hay un proceso en el grupo
      while (this.groupProcessingStatus[chatData.id._serialized]) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Espera 3 segundos
      }

      // Marca el grupo como en proceso para evitar que se procesen dos mensajes en simultaneo en el mismo grupo
      this.groupProcessingStatus[chatData.id._serialized] = true;

      // Sends message to ChatGPT
      chatData.sendStateTyping();
      let chatResponseString = await this.processMessage(chatData, chatCfg, isSuperUserChat);
      chatData.clearState();

      if(!chatResponseString) return;

      // Evaluate if message must be Audio or Text
      if (chatResponseString.includes('<Image>')) {
        // Divide el mensaje en partes usando los delimitadores
        const parts = chatResponseString.split(/\[Text]|<Image>/).map(part => part.trim());

        const [text, image] = parts.slice(1);
        await this.createImage(message, image || text, isSuperUser, image ? text : undefined);
      } else if (chatResponseString.startsWith('[Audio]')) {
        chatResponseString = chatResponseString.replace('[Audio]','').trim();
        await this.speak(message, chatData, chatResponseString, chatCfg.voice_id as CVoices);
      } else {
        chatResponseString = chatResponseString.replace('[Text]','').trim();
        await this.returnResponse(message, chatResponseString, chatData.isGroup);
      }
      return true;
    } catch (e: any) {
      logger.error(e.message);
      return message.reply('Tuve un Error con tu mensaje 😔. Intenta usar "-reset" para reiniciar la conversación.');
    } finally {
      this.groupProcessingStatus[chatData.id._serialized] = false;
    }
  }

  private returnResponse(message, responseMsg, isGroup){
    if(isGroup) return message.reply(responseMsg);
    else return this.client.sendMessage(message.from, responseMsg);
  }

  /**
   * Selects and executes an action based on the recognized command in a received message.
   * This function is a command dispatcher that interprets the command (if any) present
   * in the user's message and triggers the corresponding functionality, such as creating
   * images or generating speech.
   *
   * Supported commands include generating images (`image`) or text-to-speech synthesis (`speak`).
   * The function relies on the presence of a command parsed from the message body to determine
   * the appropriate action. If a supported command is found, the function executes the associated
   * method and handles tasks like generating an image based on the provided textual content
   * or creating an audio file from text.
   *
   * Parameters:
   * - message: The Message object received from WhatsApp, which includes the command and any
   *   additional message content intended for processing.
   * - chatData: The Chat object associated with the received message, providing context such
   *   as the chat's identity and state.
   *
   * Returns:
   * - A promise that resolves to `true` if an action for a recognized command is successfully
   *   initiated, or `void` if no recognized command is found or the command functionality is
   *   disabled through the bot's configuration.
   */
  private async commandSelect(message: Message, chatData: Chat, chatCfg: ChatCfg, isCreator = false) {
    const { command, commandMessage } = parseCommand(message.body);
    switch (command) {
      case "a":
        return await this.customMp3(message, <string> commandMessage);
      case "image":
        if(isCreator || CONFIG.botConfig.imageCreationEnabled)
          return await this.createImage(message, commandMessage, isCreator);
        return true;
        break;
      case "speak":
        if (!CONFIG.botConfig.audioCreationEnabled) return;
        return await this.speak(message, chatData, commandMessage, CVoices.SARAH);
      case "reloadConfig":
        await this.loadChatConfigs();
        return message.reply('Reload OK');
      case "fakeyou":
        if(message.body == '-fakeyou') return await this.fakeyouList(message);
        return await this.fakeyou(message, chatData);
      case "reset":
        return await message.react('👍');
      case "sp":
        return await this.eleven(message, CONFIG.eleven.model_spanish);
      case "changeModel":
        return this.changeModel(message, <string>commandMessage);
      default:
        return true;
    }
  }

  private changeModel(message: Message, commandMessage: string){
    if(!commandMessage){
      const list = `*AILanguages*:\n-${AiLanguage.OPENAI}\n-${AiLanguage.ANTHROPIC}\n\n*ClaudeModels*:\n-${ClaudeModel.OPUS}\n-${ClaudeModel.SONNET}\n\n*Example*:\n-changeModel ANTHROPIC claude-3-sonnet-20240229`
      return this.client.sendMessage(message.from, list)
    }
    try {
      const input = commandMessage.split(" ");
      if (input[0]) this.aiConfig.aiLanguage = input[0].toUpperCase() as AiLanguage;
      if (input[1]) this.aiConfig.model = input[1].toLowerCase() as ClaudeModel;
      return this.client.sendMessage(message.from, `New Config ${JSON.stringify(this.aiConfig)}`)
    }catch (e: any){
      logger.error(e);
      return message.reply(e);
    }
  }

  /**
   * Processes an incoming message and generates an appropriate response using the configured AI language model.
   *
   * This function is responsible for constructing the context for the AI model based on recent chat messages,
   * subject to certain limits and filters. It then sends the context to the selected AI language model
   * (either OpenAI or Anthropic) to generate a response.
   *
   * The function handles various aspects of the conversation, such as:
   *
   * - Filtering out messages older than a specified time limit.
   * - Limiting the number of messages and tokens sent to the AI model.
   * - Handling image and audio messages, and including them in the context if applicable.
   * - Resetting the conversation context if the "-reset" command is encountered.
   *
   * The generated response is then returned as a string.
   *
   * @param chatData - The Chat object representing the conversation context.
   * @param chatCfg - The ChatCfg object containing configuration settings for the bot's behavior.
   * @param isPersonal - Whether the message is a personal message or not.
   * @returns A promise that resolves with the generated response string, or null if no response is needed.
   */
  private async processMessage(chatData: Chat, chatCfg: ChatCfg, isPersonal: boolean) {

    const actualDate = new Date();

    // Initialize an array of messages
    let messageList: AiMessage[] = [];
    let processedMessages = 0;

    let promptText = chatCfg.buildprompt?
      CONFIG.buildPrompt(capitalizeString(chatCfg.prompt_name), chatCfg.limit, chatCfg.maximages, chatCfg.characterslimit, chatCfg.prompt_text) : chatCfg.prompt_text;
    promptText = chatCfg.prompt_name == 'profesor'? CONFIG.buildO1Prompt(chatCfg.limit, chatCfg.prompt_text):promptText;

    // Retrieve the last 'limit' number of messages to send them in order
    const fetchedMessages = await chatData.fetchMessages({ limit: 300 });
    // Check for "-reset" command in chat history to potentially restart context
    const resetCommands = ["-reset", "-r", "!n"];
    const resetIndex = fetchedMessages.map(msg => msg.body).reduce((lastIndex, currentBody, currentIndex) => {
      return resetCommands.includes(currentBody) ? currentIndex : lastIndex;
    }, -1);
    const messagesToProcess = resetIndex >= 0 ? fetchedMessages.slice(resetIndex + 1) : fetchedMessages;

    // Placeholder for promises for transcriptions
    let transcriptionPromises: { index: number, promise: Promise<string> }[] = [];
    let imageCount: number = 0;

    logger.info('Comenzando lectura de mensajes')

    for (const msg of messagesToProcess.reverse()) {
      try {
        // Validate if the message was written less than 24 (or maxHoursLimit) hours ago; if older, it's not considered
        const msgDate = new Date(msg.timestamp * 1000);
        if ((actualDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60) > chatCfg.hourslimit) break;

        const isImage = msg.type == MessageTypes.STICKER || msg.type === MessageTypes.IMAGE;
        const isAudio = msg.type == MessageTypes.AUDIO || msg.type === MessageTypes.VOICE;
        const isOther = !isImage && !isAudio && msg.type != 'chat';

        // Checks if a message already exists in the cache
        const cachedMessage = this.getCachedMessage(msg);

        // Limit the number of processed images to only the last few
        const media = (isImage && imageCount < chatCfg.maximages) || (isAudio && !cachedMessage) ?
          await msg.downloadMedia() : null;
        if (media && isImage) imageCount++;

        const role = (!msg.fromMe || isImage) ? AiRole.USER : AiRole.ASSISTANT;
        const name = msg.fromMe ? capitalizeString(chatCfg.prompt_name) : (await getContactName(msg));

        const content: Array<AiContent> = [];
        if (isOther) content.push({type: 'text', value: getUnsupportedMessage(msg)});
        if (isImage && media) content.push({type: 'image', value: media.data, media_type: media.mimetype});
        if (isImage && !media) content.push({type: 'text', value: '<Unprocessed image>'});
        if (isAudio && media && !cachedMessage) {
          transcriptionPromises.push({index: messageList.length, promise: this.transcribeVoice(media, msg)});
          content.push({type: 'text', value: '<Transcribiendo mensaje de voz...>'});
        }
        if (isAudio && cachedMessage) content.push({type: 'text', value: cachedMessage});
        if (msg.body && !isOther) content.push({type: 'text', value: '[Text]' + msg.body});

        messageList.push({role: role, name: name, content: content});
        processedMessages++;
      }catch (e:any){
        logger.error(`Error en Lectura de Mensage - msg.type:${msg.type}; msg.body:${msg.body}`);
        const contactInfo = await msg.getContact();
        logger.error(`contactInfo.name:${contactInfo.name}`);
        logger.error(`Error: ${e.message}`);
      }
    }
    logger.info('Lectura de mensajes OK');

    logger.info('Comenzando transcripcion de audios');
    // Wait for all transcriptions to complete
    const transcriptions = await Promise.all(transcriptionPromises.map(t => t.promise));
    transcriptionPromises.forEach((transcriptionPromise, idx) => {
      const transcription = transcriptions[idx];
      const messageIdx = transcriptionPromise.index;
      messageList[messageIdx].content = messageList[messageIdx].content.map(c =>
        c.type === 'text' && c.value === '<Transcribiendo mensaje de voz...>'? { type: 'text', value: transcription } : c
      );
    });

    logger.info('Transcripcion de audios OK');

    // If no new messages are present, return without action
    if (messageList.length == 0) return;

    // Send the message and return the text response
    logger.debug(`Sending Messages to "${chatCfg.prompt_name}" profile. Processed Messages: ${processedMessages}`);
    // Send the message and return the text response
    if (this.aiConfig.aiLanguage == AiLanguage.OPENAI) {
      const convertedMessageList: ChatCompletionMessageParam[] = this.convertIaMessagesLang(messageList.reverse(), AiLanguage.OPENAI) as ChatCompletionMessageParam[];
      return await this.chatGpt.sendMessages(convertedMessageList, promptText, chatCfg.ia_model, chatCfg.maxtokens);
    } else if (this.aiConfig.aiLanguage == AiLanguage.ANTHROPIC) {
      const convertedMessageList: MessageParam[] = this.convertIaMessagesLang(messageList.reverse(), AiLanguage.ANTHROPIC) as MessageParam[];
      return await this.claude.sendChat(convertedMessageList, promptText, isPersonal? ClaudeModel.OPUS: this.aiConfig.model);
    }
  }

  /**
   * Generates and sends an audio message by synthesizing speech from the provided text content.
   * If no content is explicitly provided, the function attempts to use the last message sent by the bot as the text input for speech synthesis.
   * The generated speech audio is then sent as a reply in the chat.
   *
   * Parameters:
   * - message: The Message object received from WhatsApp. This object contains all the message details and is used to reply with the generated audio.
   * - chatData: The Chat object associated with the received message. This provides context and chat details but is not directly used in this function.
   * - content: The text content to be converted into speech. Optional; if not provided, the function will use the last message sent by the bot.
   *
   * Returns:
   * - A promise that either resolves when the audio message has been successfully sent, or rejects if an error occurs during the process.
   */
  private async speak(message: Message, chatData: Chat, content: string | undefined, voiceId: CVoices) {
    // Set the content to be spoken. If no content is explicitly provided, fetch the last bot reply for use.
    let messageToSay = content || await this.getLastBotMessage(chatData);
    try {
      // Generate speech audio from the given text content using the OpenAI API.
      //const audioBuffer = await this.chatGpt.speech(messageToSay, responseFormat);
      const audioRaw: boolean | string = await elevenTTS(voiceId || CVoices.SARAH, messageToSay, CONFIG.eleven.model_spanish);
      const base64Audio = await convertStreamToMessageMedia(audioRaw);

      let audioMedia = new MessageMedia('audio/mp3; codecs=opus', base64Audio, 'voice.mp3');

      // Reply to the message with the synthesized speech audio.
      const repliedMsg = await message.reply(audioMedia, undefined, { sendAudioAsVoice: true });

      this.cache.set(repliedMsg.id._serialized, '[Audio]'+messageToSay, CONFIG.botConfig.redisCacheTime);
    } catch (e: any) {
      logger.error(`Error in speak function: ${e.message}`);
      throw e;
    }
  }

  /**
   * Creates and sends an image in response to a message, based on provided textual content.
   * The function calls an external API to generate an image using the provided text as a prompt.
   * The resulting image is then sent as a reply in the chat.
   *
   * Parameters:
   * - message: The Message object received from WhatsApp, which contains all the details of the message and is used to reply with the generated image.
   * - content: The text content that will serve as a prompt for the image generation. This content should ideally be descriptive to result in a more accurate image.
   *
   * Returns:
   * - A promise that either resolves when the image has been successfully sent, or rejects if an error occurs during the image generation or sending process.
   */
  private async createImage(message: Message, content: string | undefined, isCreator: boolean, text?: string) {
    // Verify that content is provided for image generation, return if not.
    if (!content) return;


    if(!isCreator && !CONFIG.botConfig.imageCreationEnabled)
      return message.reply('Lo siento, pero solo Diego puede pedirme que haga una imagen.');

    try {
      // Calls the ChatGPT service to generate an image based on the provided textual content.
      const imgUrl = await this.chatGpt.createImage(content) as string;
      const media = await MessageMedia.fromUrl(imgUrl);
      const options = {
        caption: text || 'Aquí está la imagen que generé basado en tu solicitud.'
      };

      // Reply to the message with the generated image.
      return await message.reply(media, undefined, options);
    } catch (e: any) {
      logger.error(`Error in createImage function: ${e.message}`);
      // In case of an error during image generation or sending the image, inform the user.
      throw e;
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

  private async eleven(message: Message, model: string) {
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

  private async getLastBotMessage(chatData: Chat) {
    const lastMessages = await chatData.fetchMessages({limit: 12});
    let lastMessageBot: string = '';
    for (const msg of lastMessages) {
      if(msg.fromMe && msg.body.length>1) lastMessageBot = msg.body;
    }
    return lastMessageBot;
  }

  /**
   * Converts AI message structures between different language models (OPENAI and ANTHROPIC).
   * This function takes a list of AI messages, which may include text and image content,
   * and converts this list into a format compatible with the specified AI language model.
   * It supports conversion to both OpenAI and Anthropic message formats.
   *
   * Parameters:
   * - messageList: An array of AiMessage, representing the messages to be converted.
   * - lang: An AiLanguage enum value indicating the target language model (OPENAI or ANTHROPIC).
   *
   * Returns:
   * - An array of MessageParam (for Anthropic) or ChatCompletionMessageParam (for OpenAI),
   *   formatted according to the specified language model. The type of array returned depends
   *   on the target language model indicated by the lang parameter.
   */
  private convertIaMessagesLang(messageList: AiMessage[], lang: AiLanguage ): MessageParam[] | ChatCompletionMessageParam[]{
    switch (lang){
      case AiLanguage.ANTHROPIC:

        const claudeMessageList: MessageParam[] = [];
        let currentRole: AiRole = AiRole.USER;
        let gptContent: Array<TextBlock | ImageBlockParam> = [];
        messageList.forEach((msg, index) => {
          const role = msg.role === AiRole.ASSISTANT && msg.content.find(c => c.type === 'image') ? AiRole.USER : msg.role;
          if (role !== currentRole) { // Change role or if it's the last message
            if (gptContent.length > 0) {
              claudeMessageList.push({ role: currentRole, content: gptContent });
              gptContent = []; // Reset for the next block of messages
            }
            currentRole = role; // Ensure role alternation
          }

          // Add content to the current block
          msg.content.forEach(c => {
            if (c.type === 'text') gptContent.push({ type: 'text', text:<string> c.value });
            else if (c.type === 'image') gptContent.push({ type: 'image', source: { data: <string>c.value, media_type: c.media_type as any, type: 'base64' } });
          });
        });
        // Ensure the last block is not left out
        if (gptContent.length > 0) claudeMessageList.push({ role: currentRole, content: gptContent });

        // Ensure the first message is always AiRole.USER (by API requirement)
        if (claudeMessageList.length > 0 && claudeMessageList[0].role !== AiRole.USER) {
          claudeMessageList.shift(); // Remove the first element if it's not USER
        }

        return claudeMessageList;

      case AiLanguage.OPENAI:

        const chatgptMessageList: any[] = [];
        messageList.forEach(msg => {
          const gptContent: Array<ChatCompletionContentPart> = [];
          msg.content.forEach(c => {
            if(c.type == 'image') gptContent.push({ type: 'image_url', image_url: { url: `data:${c.media_type};base64,${c.value}`} });
            if(c.type == 'text') gptContent.push({ type: 'text', text: <string> c.value });
          })
          chatgptMessageList.push({content: gptContent, name: msg.name, role: msg.role});
        })
        return chatgptMessageList;

      case AiLanguage.DEEPSEEK:


      default:
        return [];
    }
  }

  private async transcribeVoice(media: MessageMedia, message: Message): Promise<string> {
    try {

      //Comprueba si existe en cache
      const cachedMessage = await this.cache.get<string>(message.id._serialized);
      if(cachedMessage) return cachedMessage;

      // Convertir la media base64 a un Buffer
      const audioBuffer = Buffer.from(media.data, 'base64');
      logger.debug(`Buffer de audio creado con tamaño: ${audioBuffer.length}`);
      const audioStream = bufferToStream(audioBuffer);

      logger.debug(`[ChatGTP->transcribeVoice] Iniciando transcripción de audio`);

      const transcribedText = await this.chatGpt.transcription(audioStream);

      // Log del texto transcrito
      logger.debug(`[ChatGTP->transcribeVoice] Texto transcrito: ${transcribedText}`);

      // Agregar el prefijo informativo
      const finalMessage = `[Audio]${transcribedText}`;

      // Se guarda en cache
      this.cache.set(message.id._serialized, finalMessage, CONFIG.botConfig.redisCacheTime);

      return finalMessage;
    } catch (error: any) {
      // Manejo de errores
      logger.error(`Error transcribing voice message: ${error.message}`);
      return '<Error transcribiendo el mensaje de voz>';
    }
  }

  private getCachedMessage(msg: Message){
    return this.cache.get<string>(msg.id._serialized);
  }
}
