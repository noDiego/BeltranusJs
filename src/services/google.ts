import textToSpeech from '@google-cloud/text-to-speech';
import * as protos from '@google-cloud/text-to-speech/build/protos/protos';
import { ClientOptions, GoogleAuth } from 'google-gax';
import { config } from 'dotenv';
import { randomNumber, sleep } from '../utils';
import { google } from '@google-cloud/text-to-speech/build/protos/protos';
import SsmlVoiceGender = google.cloud.texttospeech.v1.SsmlVoiceGender;
import logger from '../logger';
import { CONFIG } from '../config';

config();

let client;
const opts: ClientOptions = {key: CONFIG.google.youtubeApiKey};
const textToSpeechClient = new textToSpeech.TextToSpeechClient(opts);

async function authGoogle() {
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
  });
  client = await auth.getClient();
  const projectId = await auth.getProjectId();
  const url = `https://dns.googleapis.com/dns/v1/projects/${projectId}`;
  try {
    const res = await client.request({url});
  } catch (e) {
    await sleep(2000);
  }
}

export async function getVoices() {
  if (!client) await authGoogle();
  const [result] = await textToSpeechClient.listVoices({});
  const voices = result.voices;

  console.log('Voices:');
  voices?.forEach(voice => {
    voice.languageCodes?.forEach(languageCode => {
      if (languageCode.includes('es-US')) {
        console.log({
          name: voice.name,
          ssmlGender: voice.ssmlGender,
        });
      }
    });
  });
}

export async function getMp3Message(message: string, gender?: "MALE" | "FEMALE") {

  if (!client) await authGoogle();

  const voz = {name: 'es-US-Standard-A', ssmlGender: 'FEMALE'};
  // const voz = getRandomVoice(gender);

  logger.debug('Generando audio con voz: ' + voz.name + ". Genero: " + voz.ssmlGender);

  const rq: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: {text: message},
    voice: {languageCode: 'es-US', ssmlGender: voz.ssmlGender == "MALE" ? SsmlVoiceGender.MALE : SsmlVoiceGender.FEMALE, name: voz.name},
    audioConfig: {audioEncoding: 'MP3'},
  };

  // Performs the text-to-speech request
  const [response]: any = await textToSpeechClient.synthesizeSpeech(rq);
  return response as protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse;
}

function getRandomVoice(gender?: "MALE" | "FEMALE") {
  const voicesMale = [
    {name: 'es-US-Standard-B', ssmlGender: 'MALE'},
    {name: 'es-US-Standard-C', ssmlGender: 'MALE'},
    {name: 'es-US-Wavenet-B', ssmlGender: 'MALE'},
    {name: 'es-US-Wavenet-C', ssmlGender: 'MALE'},
    {name: 'es-US-News-E', ssmlGender: 'MALE'},
    {name: 'es-US-News-D', ssmlGender: 'MALE'},
    {name: 'es-US-Neural2-B', ssmlGender: 'MALE'},
    {name: 'es-US-Neural2-C', ssmlGender: 'MALE'}];
  const voicesFemale = [
    {name: 'es-US-Standard-A', ssmlGender: 'FEMALE'},
    {name: 'es-US-Wavenet-A', ssmlGender: 'FEMALE'},
    {name: 'es-US-News-G', ssmlGender: 'FEMALE'},
    {name: 'es-US-News-F', ssmlGender: 'FEMALE'},
    {name: 'es-US-Neural2-A', ssmlGender: 'FEMALE'}];

  if(!gender)
    return randomNumber(0,1) == 0? voicesMale[randomNumber(0, voicesMale.length - 1)] : voicesFemale[randomNumber(0, voicesFemale.length - 1)];
  else if (gender == "MALE")
    return voicesMale[randomNumber(0, voicesMale.length - 1)]
  else
    return voicesFemale[randomNumber(0, voicesFemale.length - 1)]
}

