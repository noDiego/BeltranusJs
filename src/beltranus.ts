import { ChatGTP } from './services/chatgpt';
import { Chat, Message, MessageMedia, MessageSendOptions, MessageTypes } from 'whatsapp-web.js';
import {
  capitalizeString,
  contarTokens,
  convertStreamToMessageMedia,
  convertWavToMp3,
  getCloudFile,
  getContactName,
  getMsgData,
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
import { CModel, CVoices, elevenTTS } from './services/eleven';
import * as fs from 'fs';
import path from 'path';
import { FakeyouModel } from './interfaces/fakeyou.interfaces';
import { AiContent, AiLanguage, AiMessage, AiRole } from './interfaces/ai-message';
import { Claude } from './services/claude';
import { ChatCompletionMessageParam } from 'openai/resources';
import Anthropic from '@anthropic-ai/sdk';
import ChatCompletionContentPart = OpenAI.ChatCompletionContentPart;
import MessageParam = Anthropic.MessageParam;
import ImageBlockParam = Anthropic.ImageBlockParam;
import TextBlock = Anthropic.TextBlock;
import { ClaudeModel } from './interfaces/claude-model';

export class Beltranus {

  private client
  private chatGpt: ChatGTP;
  private claude: Claude;
  private fakeyouService: FakeyouService;
  private db: PostgresClient;
  private chatConfigs: ChatCfg[];
  private allowedTypes = [MessageTypes.STICKER, MessageTypes.TEXT, MessageTypes.IMAGE];
  private aiConfig = {
    aiLanguage: AiLanguage.ANTHROPIC,
    model: ClaudeModel.SONNET
  };
  private imageTokens = 255; //Tokens Image 512x512

  public constructor(client) {
    this.client = client;
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

  private async getChatConfig(message: Message, chatData: Chat): Promise<ChatCfg | null>{
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
    try {

      // Extract the data input (extracts command e.g., "-a", and the message)
      const chatData: Chat = await message.getChat();
      const { command, commandMessage } = parseCommand(message.body);

      // If it's a "Broadcast" message, it's not processed
      if(chatData.id.user == 'status' || chatData.id._serialized == 'status@broadcast') return false;

      if(!this.allowedTypes.includes(message.type) || message.type == MessageTypes.AUDIO ||message.type == MessageTypes.VOICE) return false;

      // Se evalua si corresponde a algun bot
      let chatCfg: ChatCfg = await this.getChatConfig(message, chatData) as ChatCfg;
      if(chatCfg == null && !command) return false;

      // Logs the message
      logMessage(message, chatData);

      // Evaluates if it should go to the command flow
      if(!!command){
        await chatData.sendStateTyping();
        await this.commandSelect(message, chatData, chatCfg);
        await chatData.clearState();
        return true;
      }

      // Sends message to ChatGPT
      chatData.sendStateTyping();
      const chatResponseString = await this.processMessage(chatData, chatCfg);
      chatData.clearState();

      if(!chatResponseString) return;

      return this.returnResponse(message, chatResponseString, chatData.isGroup);
    } catch (e: any) {
      logger.error(e.message);
      return message.reply('Tuve un Error con tu mensaje 😔. Intenta usar "-reset" para reiniciar la conversación.');
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
  private async commandSelect(message: Message, chatData: Chat, chatCfg: ChatCfg) {
    const { command, commandMessage } = parseCommand(message.body);
    switch (command) {
      case "a":
        return await this.customMp3(message, <string> commandMessage);
      case "image":
        if (!CONFIG.botConfig.imageCreationEnabled) return;
        return await this.createImage(message, commandMessage);
      case "speak":
        if (!CONFIG.botConfig.audioCreationEnabled) return;
        return await this.speak(message, chatData, commandMessage);
      case "reloadConfig":
        await this.loadChatConfigs();
        return message.reply('Reload OK');
      case "fakeyou":
        if(message.body == '-fakeyou') return await this.fakeyouList(message);
        return await this.fakeyou(message, chatData);
      case "sp":
        return await this.eleven(message, CModel.SPANISH);
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
   * @returns A promise that resolves with the generated response string, or null if no response is needed.
   */
  private async processMessage(chatData: Chat, chatCfg: ChatCfg) {

    const actualDate = new Date();

    // Initialize an array of messages
    let messageList: AiMessage[] = [];

    // The first element will be the system message
    const promptText = chatCfg.buildprompt? CONFIG.buildPrompt(capitalizeString(chatCfg.prompt_name), chatCfg.limit, chatCfg.characterslimit, chatCfg.prompt_text) : chatCfg.prompt_text;
    let totalTokens = await contarTokens(promptText); // Inicializa total de tokens con Prompt para no superar el maximo

    // Retrieve the last 'limit' number of messages to send them in order
    const fetchedMessages = await chatData.fetchMessages({ limit: 300 });
    // Check for "-reset" command in chat history to potentially restart context
    const resetCommands = ["-reset", "-r", "!n"];
    const resetIndex = fetchedMessages.map(msg => msg.body).reduce((lastIndex, currentBody, currentIndex) => {
      return resetCommands.includes(currentBody) ? currentIndex : lastIndex;
    }, -1);
    const messagesToProcess = resetIndex >= 0 ? fetchedMessages.slice(resetIndex + 1) : fetchedMessages;

    for (const msg of messagesToProcess.reverse()) {

      // Validate if the message was written less than 24 (or maxHoursLimit) hours ago; if older, it's not considered
      const msgDate = new Date(msg.timestamp * 1000);
      const timeDifferenceHours = (actualDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60);
      const isImage = msg.type == MessageTypes.STICKER || msg.type === MessageTypes.IMAGE;
      const isAudio = msg.type == MessageTypes.AUDIO || msg.type === MessageTypes.VOICE;

      if (timeDifferenceHours > chatCfg.hourslimit) continue;

      if (!this.allowedTypes.includes(msg.type) && !isAudio) continue;

      // Check if the message includes media
      const media = isImage? await msg.downloadMedia() : null;

      const role = msg.fromMe ? AiRole.ASSISTANT : AiRole.USER;
      const name = msg.fromMe ? capitalizeString(chatCfg.prompt_name) : (await getContactName(msg));

      const content: Array<AiContent> = [];
      if (isImage && media) content.push({ type: 'image', value: media.data, media_type: media.mimetype });
      if (isAudio)          content.push({ type: 'text', value: `<Audio Message>` });
      if (msg.body)         content.push({ type: 'text', value: (chatData.isGroup && !msg.fromMe? `${name}: ` : '') + msg.body });

      // Estimar el conteo de tokens para el mensaje actual
      let currentMessageTokens;
      if(isImage && media) currentMessageTokens = this.imageTokens; // Usa la función auxiliar contarTokens para estimar la cantidad de tokens.
      else currentMessageTokens = await contarTokens(content[0].value as string)

      if ((totalTokens + currentMessageTokens) > chatCfg.maxtokens) break; // Si agregar este mensaje supera el límite de tokens, detener el bucle.
      totalTokens += currentMessageTokens; // Acumular tokens.

      messageList.push({ role: role, name: name, content: content });
    }

    // If no new messages are present, return without action
    if (messageList.length == 0) return;
    messageList = messageList.reverse();

    // Limit the number of processed images to only the last few, as defined in bot configuration (maxSentImages)
    let imageCount = 0;
    for (let i = messageList.length - 1; i >= 0; i--) {
      const haveImg = messageList[i].content.find(c => c.type == 'image');
      if (haveImg) {
        imageCount++;
        if (imageCount > CONFIG.botConfig.maxImages) messageList.splice(i, 1);
      }
    }

    // Send the message and return the text response
    logger.debug(`[chatGPTReply] Sending Messages. Tokens Total: ${totalTokens}`);
    // Send the message and return the text response
    if (this.aiConfig.aiLanguage == AiLanguage.OPENAI) {
      const convertedMessageList: ChatCompletionMessageParam[] = this.convertIaMessagesLang(messageList, AiLanguage.OPENAI) as ChatCompletionMessageParam[];
      return await this.chatGpt.sendMessages(convertedMessageList, promptText);
    } else if (this.aiConfig.aiLanguage == AiLanguage.ANTHROPIC) {
      const convertedMessageList: MessageParam[] = this.convertIaMessagesLang(messageList, AiLanguage.ANTHROPIC) as MessageParam[];
      return await this.claude.sendChat(convertedMessageList, promptText, this.aiConfig.model);
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
  private async speak(message: Message, chatData: Chat, content: string | undefined) {
    // Set the content to be spoken. If no content is explicitly provided, fetch the last bot reply for use.
    let messageToSay = content || await this.getLastBotMessage(chatData);

    try {
      // Generate speech audio from the given text content using the OpenAI API.
      const audio = await this.chatGpt.speech(messageToSay);
      const audioMedia = new MessageMedia('audio/mp3', audio.toString('base64'), 'response' + '.mp3');

      // Reply to the message with the synthesized speech audio.
      await message.reply(audioMedia);
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
  private async createImage(message: Message, content: string | undefined) {
    // Verify that content is provided for image generation, return if not.
    if (!content) return;

    try {
      // Calls the ChatGPT service to generate an image based on the provided textual content.
      const imgUrl = await this.chatGpt.createImage(content) as string;
      const media = await MessageMedia.fromUrl(imgUrl);

      // Reply to the message with the generated image.
      return await message.reply(media);
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

      default:
        return [];
    }
  }

}
