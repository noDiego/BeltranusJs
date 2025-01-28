import { Chat, Contact, Message } from 'whatsapp-web.js';
import logger from './logger';
import moment from "moment-timezone";
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'stream';
import axios from 'axios';
import getStream from 'get-stream';
import { Tiktoken } from 'tiktoken/lite';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import OpenAI from 'openai';
import ChatCompletionContentPart = OpenAI.ChatCompletionContentPart;


export function getMsgData(message: Message): {command: string, content: string}{
  const command = message.body.split(' ')[0];
  const content = message.body.replace(command+' ', '');
  return { command, content };
}

export function logMessage(message: Message, chat: Chat, contactInfo: Contact){

  const msgObj: any = {
    author: String(message.author),
    chatUser: chat.id.user,
    isGroup: chat.isGroup,
    date: new Date(),
    msg: message.body
  };
  logger.info(
    `{ chatUser:${msgObj.chatUser}, isGroup:${chat.isGroup}, grId:${chat.id._serialized}, grName:${chat.name}, author:'${contactInfo.name}(${contactInfo.number})', date:'${msgObj.date.toLocaleDateString()}-${msgObj.date.toLocaleTimeString()}', msg:'${msgObj.msg}' }`
  );
}

export function includePrefix(bodyMessage: string, prefix: string): boolean {
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

export function parseCommand(input: string): { command?: string, commandMessage?: string } {
  const match = input.match(/^-(\S+)\s*(.*)/);
  if (!match) {
    return { commandMessage: input };
  }
  return { command: match[1], commandMessage: match[2] };
}

export async function getContactName(message: Message){
  const contactInfo = await message.getContact();
  const name = contactInfo.name || contactInfo.shortName || contactInfo.pushname || contactInfo.number;
  return removeNonAlphanumeric(name);
}

export function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}

export function convertWavToMp3(wavStream: any): PassThrough {
  // Crear un stream de escritura para el archivo de salida MP3
  const mp3Stream = new PassThrough();

  // Iniciar la conversión usando fluent-ffmpeg
  ffmpeg(wavStream)
    .audioCodec('libmp3lame') // Establecer el codec de audio a MP3
    .format('mp3')           // Establecer el formato de salida a MP3
    .on('end', () => {
    })
    .on('error', (err: Error) => {
      console.error('Error al convertir:', err.message);
    })
    .pipe(mp3Stream);        // Enviar el stream convertido a mp3Stream

  return mp3Stream; // Devolver el stream MP3 para su uso posterior
}

export async function httpGet(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    logger.error(error);
  }
}

export async function convertStreamToMessageMedia(audioStream) {
  // Convertir el flujo a un Buffer
  const audioBuffer = await getStream.buffer(audioStream);

  // Convertir el Buffer a una cadena Base64
  return audioBuffer.toString('base64');
}

export async function getCloudFile(url:string){
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
  });
  return response.data;
}

export function capitalizeString(str) {
  // Verifica si el string está vacío
  if (str.length === 0) return str;

  // Convierte la primera letra a mayúscula y concatena con el resto del string.
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getLastElementsArray<T>(msgs: T[], qty): T[] {
  const array = structuredClone(msgs);
  if (array.length <= qty) return array.slice();
  const inicio = array.length - qty;
  return array.slice(inicio);
}

export function cleanImagesLog(array: ChatCompletionMessageParam[]){
  array.forEach((e:any) => {
    e.content!.forEach((c:ChatCompletionContentPart) =>{
      if(c.type == 'image_url') c.image_url.url = '<base64img>';
    })
  });
  return array;
}

export function logGPTMessages(messages: ChatCompletionMessageParam[]){
  const msgs = getLastElementsArray(messages, 3);
  logger.debug(cleanImagesLog(msgs));
}

 /**
 * Convierte un buffer en un ReadableStream.
 * @param buffer El buffer de entrada.
 * @returns Un stream de lectura (ReadStream).
 */
export function bufferToStream(buffer) {
   const stream = new Readable();
   stream.push(buffer);
   stream.push(null);
   return stream;
 }

export async function convertToOgg(buffer) {
  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream.push(buffer);
    inputStream.push(null);

    const outputStream = new PassThrough(); // Create a PassThrough stream to capture the Ogg output

    const outputBuffers: any[] = [];

    outputStream.on('data', (data) => outputBuffers.push(data)); // Collect chunks into an array
    outputStream.on('end', () => resolve(Buffer.concat(outputBuffers))); // Concatenate and resolve as a single Buffer
    outputStream.on('error', (err) => reject(err)); // Handle errors

    ffmpeg()
      .input(inputStream)
      .toFormat('ogg')
      .pipe(outputStream); // Pipe the output to the PassThrough stream
  });
}

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(res => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}
