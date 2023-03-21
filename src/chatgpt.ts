import { Configuration, OpenAIApi } from "openai";
import logger from './logger';
import { ChatCompletionRequestMessage } from 'openai/api';

export class ChatGTP {

  private openai: OpenAIApi;

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
  }

  async sendMessages(messageList: ChatCompletionRequestMessage[]) {

    logger.info(`[ChatGTP->sendMessages] Enviando ${messageList.length} mensajes`);

    logger.debug('[ChatGTP->sendMessages] Message List:');
    logger.debug(messageList);

    const completion = await this.openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messageList,
    });

    logger.debug('[ChatGTP->sendMessages] Completion Response:');
    logger.debug(completion.data);

    const messageResult = completion.data.choices[0].message;

    return messageResult?.content || '';
  }

}