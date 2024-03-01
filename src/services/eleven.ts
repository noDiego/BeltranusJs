import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { OpenAIREsponse } from '../interfaces/predict-response';
import logger from '../logger';
import { Readable } from 'stream';

export enum CVoices {
  JIRO = 'BWDzJ8HGBnd2LKnzyNZW',
  DARKAYSER = 'kSv7ExgVZm6PJMseGkKu',
  CHAINER = '170l9BgOYvdt9LkK6Bkg',
  CAIN = 'zq4MUhutQpQKs3OA6fgF',
  AKARA = 'teMPK4uoK2JqyNAxMUnI',
  PINERA = 'nppBs8tfCJ2smgETSuOb',
  PINOCHO = 'qcv1vSIo5ukABa4OPPm2',
  WENCHO = 'cNX4JVnC2gBtWgNynNSt',
  NOXFER = 'jlV396zr6NdomGXoB5aK',
}

export enum CModel {
  ENGLISH = 'eleven_monolingual_v2',
  SPANISH = 'eleven_multilingual_v2'
}

export async function elevenTTS(voice: CVoices, msg: string, model: CModel): Promise<any> {

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
  const body = {
    text: msg,
    model_id: model || CModel.SPANISH,
    voice_settings: {
      stability: 0.4,
      similarity_boost: 1,
    },
  };
  const headers = {
    accept: 'audio/mpeg',
    'xi-api-key': process.env.ELEVEN_KEY,
    'Content-Type': 'application/json',
  };

  const options: any = {
    responseType: 'arraybuffer',
    method: 'POST',
    headers: headers,
    data: body,
    url,
  };

  try {
    const response: AxiosResponse<OpenAIREsponse> = await axios(options);

    const readable = new Readable({
      read() {
        this.push(response.data);
        this.push(null);
      },
    });

    return readable;
  } catch (error) {
    logger.error(error);
  }
}
