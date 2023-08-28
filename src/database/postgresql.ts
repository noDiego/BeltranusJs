import {Client} from 'pg';
import { ChatCfg } from '../interfaces/chatinfo';
import logger from "../logger";
require('dotenv').config();

const config = {
  user: String(process.env.PSQL_USER),
  password: String(process.env.PSQL_PASS),
  host: process.env.PSQL_HOST,
  database: process.env.PSQL_DB,
  keepAlive: false
}

export class PostgresClient {
  private static instance: PostgresClient;
  private client: Client;
  private lastQueryTime: Date = new Date();
  private isConnected = false;private tiempoInactividad = 2 * 60 * 1000; // 10 minutos

  constructor() {
    this.startTimer();
  }

  private async getClient(){
    if(!this.isConnected) {
      this.client = new Client(config);
      await this.client.connect();
      this.isConnected = true;
      logger.info(JSON.stringify(config));
      logger.info('Conexion a PostgreSQL iniciada');
    }
    this.lastQueryTime = new Date();
    return this.client;
  }

  private startTimer(){
    // Establecer el temporizador para desconectar la base de datos
    setInterval(async () => {
      const timeSinceLastQuery = new Date().getTime() - this.lastQueryTime.getTime();
      if (this.isConnected && timeSinceLastQuery > this.tiempoInactividad) {
        await this.client.end();
        this.isConnected = false;
        logger.info('PostgreSQL disconnected due to inactivity');
      }
    }, this.tiempoInactividad);
  }

  public static getInstance(): PostgresClient {
    if (!PostgresClient.instance) {
      PostgresClient.instance = new PostgresClient();
    }
    return PostgresClient.instance;
  }

  private async query(sql: string, params: any[] = []): Promise<any> {

    const client = await this.getClient();

    try {
      const result = await client.query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  public async loadChatConfigs(): Promise<ChatCfg[]>{
    const query = `SELECT * FROM wenchotino.chats_cfg p`;
    const rows = await this.query(query, []);
    return rows as ChatCfg[];
  }

}