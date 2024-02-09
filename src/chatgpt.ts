import logger from './logger';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';

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
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0
    });

    logger.debug('[ChatGTP->sendMessages] Completion Response:');
    logger.debug(completion.choices[0]);

    const messageResult = completion.choices[0].message;

    return messageResult?.content || '';
  }

}
