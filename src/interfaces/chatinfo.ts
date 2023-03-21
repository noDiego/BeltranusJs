export interface Chatinfo {
  prompt_name: string;
  lastmessage_id: string;
  conversation_id: string;
  prompt_text: string;
  gif_url: string;
  messages: GPTMessage[];
  limit: number;
  prefix: string;
}

export interface ChatCfg {
  prompt_name: string;
  conversation_id: string;
  lastmessage_id: string;
  prompt_text: string;
  gif_url: string;
  limit: number;
  prefix: string;
  groups: string;
  premsg: string;
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