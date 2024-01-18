import {Chat, Message} from 'whatsapp-web.js';
import logger from './logger';
import moment from "moment-timezone";

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
    `{ chatUser:${msgObj.chatUser}, isGroup:${chat.isGroup}, grId:${chat.id._serialized}, grName:${chat.name}, author:'${msgObj.author}', date:'${msgObj.date.toLocaleDateString()}-${msgObj.date.toLocaleTimeString()}', msg:'${msgObj.msg}' }`
  );
}

export function handleError(e: any, message: Message){
  logger.error(e.message);
}

export function tienePrefix(bodyMessage: string, prefix: string): boolean {
  const regex = new RegExp(`(^|\\s)${prefix}($|[!?.]|\\s|,\\s)`, 'i');
  return regex.test(bodyMessage);
}

export function getCLStringDate(date?: Date){
  return moment(date).tz('America/Santiago').format()+"CL";
}

export function removeNonAlphanumeric(str: string): string {
  if(!str) return str;
  const regex = /[^a-zA-Z0-9]/g;
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(regex, '');
}

export function filtraJailbreak(msg){
  const splitted = msg.split('[🔓JAILBREAK] ');
  if(splitted.length >1)
    return splitted[1];
  return msg;
}

export function parseCommand(input: string): { command?: string, commandMessage?: string } {
  const match = input.match(/^-(\S+)\s*(.*)/);
  if (!match) {
    return { commandMessage: input };
  }
  return { command: match[1], commandMessage: match[2] };
}

export async function getContactName(message: Message){
  const contactInfo = await message.getContact();
  const name = contactInfo.name? contactInfo.name: contactInfo.pushname;
  return removeNonAlphanumeric(name);
}

export function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}
