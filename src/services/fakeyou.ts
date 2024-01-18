import { FakeyouModel, FakeyouModelResponse } from '../interfaces/fakeyou.interfaces';
import { httpGet } from '../http';
import { CONFIG } from '../config';
import FakeYou from 'fakeyou.js';
import logger from '../logger';

class FakeyouService {
  private fyClient;
  private fakeyouModels: FakeyouModel[];

  constructor() {
    this.fyClient = new FakeYou.Client({
      usernameOrEmail: CONFIG.fakeyou.credentials.email,
      password: CONFIG.fakeyou.credentials.password
    });
    this.fyClient.start().then(()=>{
      logger.info('Fakeyou started OK')
    });
  }

  async makeTTS(fyModel: FakeyouModel, text: string) {

    let models = this.fyClient.searchModel(fyModel.title);
    let result = await this.fyClient.makeTTS(models.first(), text);
    result.audioURL();

    return result.audioURL();
  }

  getModelList(): FakeyouModel[] {
    return this.fakeyouModels;
  }

  async loadModelList(){
    const res: FakeyouModelResponse = await httpGet('https://api.fakeyou.com/tts/list');
    this.fakeyouModels = res.models.filter(mod => (CONFIG.fakeyou.model_filter.creators.includes(mod.creator_username) ||
        mod.title.toLowerCase().includes('latin')) &&
      this.calcularNota(mod.user_ratings) >= CONFIG.fakeyou.model_filter.min_rating &&
      mod.ietf_primary_language_subtag == 'es');
    return this.fakeyouModels;
  }

  private calcularNota(ratings) {
    const { positive_count, total_count } = ratings;
    const nota = positive_count / total_count * 5;
    return Math.round(nota * 10) / 10; // Redondea a 1 decimal.
  }
}

export default FakeyouService;
