import axios from 'axios';
import logger from './logger';

export async function httpGet(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    logger.error(error);
  }
}

export async function ttsmp3Get(msg: string, lang: string): Promise<{ URL: string }> {
  const bodyFormData = new URLSearchParams()

    bodyFormData.append('msg', msg);
    bodyFormData.append('lang', lang);
    bodyFormData.append('source', "ttsmp3");

  try {
    const response = await axios.post("https://ttsmp3.com/makemp3_new.php",bodyFormData);
    return response.data;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getCloudFile(url:string){
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
    });
    return response.data;
}
