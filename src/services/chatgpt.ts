import logger from '../logger';
import OpenAI, { toFile } from 'openai';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import { GPTRol } from '../interfaces/chatinfo';
import { CONFIG } from '../config';
import { logGPTMessages, sleep } from '../utils';

export class ChatGTP {

  private openai: OpenAI;
  private readonly gptModel: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.gptModel = <string>process.env.GPT_MODEL;
  }

  async sendMessages(messageList: ChatCompletionMessageParam[], systemPrompt: string, gptModel: string, maxTokens?: number) {

    const model = gptModel || this.gptModel;
    const isO1 = model.startsWith('o1');

    logger.info(`[ChatGTP->sendMessages] Enviando ${messageList.length} mensajes (Model:${model})`);

    logger.debug('[ChatGTP->sendMessages] Message List (Last 3 Elements):');
    logGPTMessages(messageList);


    messageList.unshift({role: isO1?'user':'system', content:[{type: 'text', text: systemPrompt}]});

    const params = isO1?{
        model: model,
        messages: messageList
      }
      :{
      model: model,
      messages: messageList,
      max_tokens: maxTokens || 2048,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0
    }

    let retryCount:number = 0;
    let completion;
    do {
      try {
        logger.debug('[ChatGPT->sendMessages] Enviando a OpenAI. Intento : '+(retryCount+1));

        if(retryCount == 3) params.messages = this.sanitizeMessageList(params.messages, 'keepLast');
        if(retryCount == 4) params.messages = this.sanitizeMessageList(params.messages, 'removeAll');
        completion = await this.openai.chat.completions.create(params);
      }catch (e:any){
        logger.debug('[ChatGPT->sendMessages] Ocurrio un error: '+e.message);
        retryCount++;
        if(retryCount>4) throw e;
        await sleep(700);
      }
    }while (!completion)

    logger.debug('[ChatGTP->sendMessages] Completion Response:');
    logger.debug(completion.choices[0]);
    logger.debug('Totals Tokens used:'+ completion.usage?.total_tokens);

    return completion.choices[0].message?.content || '';
  }

  async evaluateMessageIntent(message) {

    const messageList: any[] = [];
    messageList.push({ role: GPTRol.SYSTEM,
      content: `Evaluate whether the user's message suggests an explicit request to create an image. Look for phrases that involve creation actions such as "create", "I want", "draw", "make me a picture of", among others that imply the beginning of a creative process. Respond "Yes" or "No".
      Message: "${message}"`
    })

    const completion = await this.openai.chat.completions.create({
      model: this.gptModel,
      messages: messageList,
      max_tokens: 64,
      temperature: 0
    });

    logger.debug('[ChatGTP->sendCompletion] Completion Response:');
    logger.debug(completion.choices[0]);

    const messageResult = completion.choices[0].message;

    return messageResult?.content || '';
  }

  /**
   * Requests the generation of an image based on a textual description, by interacting with OpenAI's image generation API.
   * This function takes a prompt in the form of text and sends a request to generate an image that corresponds with the text description provided.
   * It aims to utilize OpenAI's capabilities to create visually representative images based on textual inputs.
   *
   * Parameters:
   * - message: A string containing the text description that serves as the prompt for image generation.
   *
   * Returns:
   * - A promise that resolves to the URL of the generated image. This URL points to the image created by OpenAI's API based on the input prompt.
   */
  async createImage(message){

    logger.debug(`[ChatGTP->createImage] Creating message for: "${message}"`);

    const response = await this.openai.images.generate({
      model: CONFIG.openAI.imageCreationModel,
      prompt: message,
      quality: 'hd',
      n: 1,
      size: "1024x1024",
    });
    return response.data[0].url;
  }

  /**
   * Generates speech audio from provided text by utilizing OpenAI's Text-to-Speech (TTS) API.
   * This function translates text into spoken words in an audio format. It offers a way to convert written messages into audio, providing an audible version of the text content.
   * If a specific voice model is specified in the configuration, the generated speech will use that voice.
   *
   * Parameters:
   * - message: A string containing the text to be converted into speech. This text serves as the input for the TTS engine.
   *
   * Returns:
   * - A promise that resolves to a buffer containing the audio data in MP3 format. This buffer can be played back or sent as an audio message.
   */
  async speech(message, responseFormat?){

    logger.debug(`[ChatGTP->speech] Creating speech audio for: "${message}"`);

    const response: any = await this.openai.audio.speech.create({
      model: CONFIG.openAI.speechModel,
      voice: <any>CONFIG.openAI.speechVoice,
      input: message,
      response_format: responseFormat || 'mp3'
    });
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Transcribes audio content into text using OpenAI's transcription capabilities.
   * This function takes an audio file and sends a request to OpenAI's API to generate a textual representation of the spoken words.
   * It leverages the Whisper model for high-quality transcription, converting audio inputs into readable text output.
   *
   * Parameters:
   * - message: A string indicating the audio file path or description for logging purposes. Currently, it is not used in the function's implementation but can be helpful for future extensions or logging clarity.
   *
   * Returns:
   * - A promise that resolves to a string containing the transcribed text. This string is the result of processing the provided audio through OpenAI's transcription model.
   *
   * Throws:
   * - Any errors encountered during the process of reading the audio file or interacting with OpenAI's API will be thrown and should be handled by the caller function.
   */
  async transcription(stream: any) {
    logger.debug(`[ChatGTP->transcription] Creating transcription text for audio"`);
    try {
      // Convertir ReadStream a File o Blob
      const file = await toFile(stream, 'audio.ogg', { type: 'audio/ogg' });
      // Enviar el archivo convertido a la API de transcripción
      const response = await this.openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: 'es'
      });
      return response.text;
    } catch (e: any) {
      logger.error(e.message);
      throw e;
    }
  }

  /**
   * Sanitiza la lista de mensajes, eliminando imágenes según el modo especificado.
   *
   * - 'keepLast': Mantiene solo la última imagen y reemplaza las anteriores con "[Imagen no procesada]".
   * - 'removeAll': Reemplaza todas las imágenes con "[Imagen no procesada]".
   *
   * @param messageListOriginal - La lista de mensajes a procesar.
   * @param mode - Modo de sanitización: 'keepLast' o 'removeAll'.
   * @returns La lista de mensajes procesada.
   */
  private sanitizeMessageList(
    messageListOriginal: ChatCompletionMessageParam[],
    mode: 'keepLast' | 'removeAll' = 'keepLast'
  ): ChatCompletionMessageParam[] {

    const messageList = structuredClone(messageListOriginal);

    // Encuentra los índices de todos los mensajes que contienen imágenes
    const imageMessageIndices: number[] = [];
    for (const message of messageList) {
      const index = messageList.indexOf(message);
      if (
        (message.content as Array<any>).some(
          contentPart =>
            contentPart.type === 'image_url' ||
            contentPart.type === 'image'
        )
      ) {
        imageMessageIndices.push(index);
      }
    }

    if (mode === 'removeAll') {
      // Reemplazar todas las imágenes con "[Imagen no procesada]"
      for (const index of imageMessageIndices) {
        messageList[index].content = (messageList[index].content as Array<any>).map(contentPart => {
          if (contentPart.type === 'image_url' || contentPart.type === 'image') {
            return { type: 'text', value: '[Imagen no procesada]' };
          }
          return contentPart;
        });
      }
    } else if (mode === 'keepLast') {
      // Si no hay imágenes, retorna la lista original
      if (imageMessageIndices.length === 0) return messageList;

      // Determina el índice de la última imagen
      const lastImageIndex = imageMessageIndices[imageMessageIndices.length - 1];

      // Recorre los mensajes que contienen imágenes y reemplaza las que no son la última
      for (const index of imageMessageIndices) {
        if (index !== lastImageIndex) {
          messageList[index].content = (messageList[index].content as Array<any>).map(contentPart => {
            if (contentPart.type === 'image_url' || contentPart.type === 'image') {
              return { type: 'text', value: '[Imagen no procesada]' };
            }
            return contentPart;
          });
        }
      }
    }

    return messageList;
  }
}
