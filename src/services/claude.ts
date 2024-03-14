import logger from '../logger';
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config';
import MessageParam = Anthropic.MessageParam;
import { ClaudeModel } from '../interfaces/claude-model';
import { getLastElementsArray } from '../utils';

export class Claude {

  private anthropic : Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: CONFIG.anthropic.apiKey,
    });
  }

  async sendChat(messageList: MessageParam[], systemPrompt: string, model: ClaudeModel) {

    logger.debug(`[Claude->sendChat] Sending ${messageList.length} messages.`);
    logger.debug('[Claude->sendMessages] Message List (Last 3 Elements):');
    logger.debug(getLastElementsArray(messageList, 3));

    const response = await this.anthropic.messages.create({
      system: systemPrompt,
      model: model,
      messages: messageList,
      max_tokens: 1250,
      top_p: 1
    });

    logger.debug('[Claude->sendChat] Completion Response:');
    logger.debug(response.content[0].text);

    return response.content[0].text || '';
  }

}
