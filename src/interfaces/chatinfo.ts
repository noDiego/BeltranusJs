export interface Chatinfo {
  prompt_name: PromptName;
  lastmessage_id: string;
  conversation_id: string;
  prompt_text: string;
  gif_url: string;
  messages: GPTMessage[]
}

export interface GPTMessage{
  id?: string;
  role: GPTRol;
  name: string;
  conversation_id?: string;
  message_text: string;
  created_at: string;
}

export enum GPTRol{
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum PromptName {
  GANDALF = 'gandalf',
  DEFAULT = 'default',
  WENCHOTINO = 'wenchotino',
  ROBOTO = 'roboto',
  CAIN = 'deckardcain',
  DAN = 'dan',
  CHATGPT = 'chatgpt',
  BELTRANUS = 'beltranus',
  MULCH = 'mulch',
  BIRDOS = 'birdobot',
}

export enum GrupoName {
  FAMILIA = 'Familia B&G',
  TEST = 'Test 5',
  BIRDITOS = 'Birdos4Ever 🎀'
}

export type PromptData = {
  name: PromptName;
  prefix: string;
  limit: number;
}

export const prompts: Record<PromptName, PromptData> = {
  [PromptName.GANDALF]: { name: PromptName.GANDALF, prefix: 'gandalf', limit: 26 },
  [PromptName.DEFAULT]: { name: PromptName.DEFAULT, prefix: 'roboto', limit: 4 },
  [PromptName.WENCHOTINO]: { name: PromptName.WENCHOTINO, prefix: 'wenchotino', limit: 30 },
  [PromptName.ROBOTO]: { name: PromptName.ROBOTO, prefix: 'roboto', limit: 6 },
  [PromptName.CAIN]: { name: PromptName.CAIN, prefix: 'cain', limit: 10 },
  [PromptName.DAN]: { name: PromptName.DAN, prefix: 'dan', limit: 4 },
  [PromptName.CHATGPT]: { name: PromptName.CHATGPT, prefix: 'roboto', limit: 8 },
  [PromptName.BELTRANUS]: { name: PromptName.BELTRANUS, prefix: 'bel', limit: 8 },
  [PromptName.MULCH]: { name: PromptName.MULCH, prefix: 'mulchquillota', limit: 2 },
  [PromptName.BIRDOS]: { name: PromptName.BIRDOS, prefix: 'birdobot', limit: 6 },
};