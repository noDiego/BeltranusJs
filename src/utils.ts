import { Chat, Message } from 'whatsapp-web.js';
import logger from './logger';

export function getMsgData(message: Message): {command: string, content: string}{
  const command = message.body.split(' ')[0];
  const content = message.body.replace(command+' ', '');
  return { command, content };
}

export function logMessage(message: Message, chat: Chat){

  const msgObj: any = {
    author: String(message.author),
    chatUser: chat.id.user,
    isGroup: chat.isGroup,
    date: new Date(),
    msg: message.body
  };
  logger.info(
    `{ chatUser:${msgObj.chatUser}, isGroup:${chat.isGroup}, author:'${msgObj.author}', date:'${msgObj.date.toLocaleDateString()}-${msgObj.date.toLocaleTimeString()}', msg:'${msgObj.msg}' }`
  );
}

export function handleError(e: any, message: Message){
  logger.error(e.message);
}

export function tienePrefix(bodyMessage: string, prefix: string): boolean{
  const comienzaCon = bodyMessage.substring(0, 4).toLowerCase() == `${prefix} ` || bodyMessage.substring(0, 4).toLowerCase() == `${prefix},` || bodyMessage.substring(0, 4).toLowerCase() == `${prefix}.`;
  const contiene = bodyMessage.includes(` ${prefix} `) || bodyMessage.includes(` ${prefix},`) || bodyMessage.includes(` ${prefix}.`);
  return comienzaCon || contiene;
}