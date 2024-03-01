import logger from '../logger';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import { GPTRol } from '../interfaces/chatinfo';
import { CONFIG } from '../config';

export class ChatGTP {

  private openai: OpenAI;
  private readonly gptModel: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.gptModel = <string>process.env.GPT_MODEL;
  }

  async sendMessages(messageList: ChatCompletionMessageParam[]) {

    logger.info(`[ChatGTP->sendMessages] Enviando ${messageList.length} mensajes`);

    logger.debug('[ChatGTP->sendMessages] Message List:');
    logger.debug(messageList);

    const completion = await this.openai.chat.completions.create({
      model: this.gptModel,
      messages: messageList,
      max_tokens: 1024,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0
    });

    logger.debug('[ChatGTP->sendMessages] Completion Response:');
    logger.debug(completion.choices[0]);

    const messageResult = completion.choices[0].message;

    return messageResult?.content || '';
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
      quality: 'standard',
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
  async speech(message){

    logger.debug(`[ChatGTP->createImage] Creating speech audio for: "${message}"`);

    const response: any = await this.openai.audio.speech.create({
      model: CONFIG.openAI.speechModel,
      voice: <any>CONFIG.openAI.speechVoice,
      input: message,
      response_format: 'mp3'
    });
    return Buffer.from(await response.arrayBuffer());
  }
}
