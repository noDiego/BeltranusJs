import { Configuration, OpenAIApi } from "openai";
import { Chatinfo, GPTRol } from './interfaces/chatinfo';
import { PostgresClient } from './database/postgresql';
import logger from './logger';

export class ChatGTP {

  private openai: OpenAIApi;
  private db: PostgresClient = PostgresClient.getInstance();

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
  }

  async sendMessage(userName: string = 'default', message: string, chatInfo: Chatinfo) {

    logger.info('Consultando con ChatGPT API');

    const messagesInput: any[] = [
      this.generatePrompt(chatInfo)
    ];

    chatInfo.messages.forEach(msg => {
      messagesInput.push({name: msg.role==GPTRol.USER? msg.name: undefined, role: msg.role, content: msg.message_text})
    })

    messagesInput.push({name:userName, role: GPTRol.USER, content: message});

    const completion = await this.openai.createChatCompletion({
      model: "gpt-3.5-turbo-0301",
      messages: messagesInput,
    });
    const messageResult = completion.data.choices[0].message;

    await this.db.saveChatMessage(chatInfo.conversation_id, userName, GPTRol.USER, message);
    await this.db.saveChatMessage(chatInfo.conversation_id, '', GPTRol.ASSISTANT, messageResult?.content || '');

    return messageResult?.content || '';
  }

  private getDefaultPrompt(){
      return `Tu nombre es Nariño. Eres un asistente muy útil. Fecha actual: ${new Date().toISOString().split('T')[0]}`;
  }

  private generatePrompt(chatInfo){
    if(chatInfo.prompt_name == 'default')
      return {role: "system", content: `Tu nombre es Nariño. Eres un asistente muy útil. Fecha actual: ${new Date().toISOString().split('T')[0]}` }
    return {role: "system", content: chatInfo.prompt_text }
  }

}