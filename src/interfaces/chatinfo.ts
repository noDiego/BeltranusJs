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
  created_at?: string;
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
  BELTRANUS = 'beltranus'
}

export enum GrupoName {
  FAMILIA = 'Familia B&G',
  TEST = 'Test 5'
}