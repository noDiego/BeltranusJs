import { Client } from 'pg';
import { Chatinfo, GPTMessage, GPTRol, PromptName } from '../interfaces/chatinfo';
import logger from '../logger';
require('dotenv').config();

const config = {
  user: process.env.PSQL_USER,
  password: process.env.PSQL_PASS,
  host: process.env.PSQL_HOST,
  database: process.env.PSQL_DB
}

const MSGS_LIMIT = 15;

export class PostgresClient {
  private client: Client;
  private static instance: PostgresClient;
  private lastQueryTime: Date;
  private connected = false;

  constructor() {

    this.client = new Client(config);

    // Establecer el temporizador para desconectar la base de datos
    const DISCONNECT_TIMEOUT = 10 * 60 * 1000; // 10 minutos
    setTimeout(() => {
      if(!this.lastQueryTime) return;

      const now = new Date();
      const timeSinceLastQuery = now.getTime() - this.lastQueryTime.getTime();
      if (timeSinceLastQuery > DISCONNECT_TIMEOUT && this.connected) {
        this.client.end().then(() => {
          this.connected = false;
          logger.info('PostgreSQL desconectado por inactividad');
        }).catch(err => {
          logger.error('Error al desconectar PostgreSQL:', err);
        });
      }
    }, DISCONNECT_TIMEOUT);
  }

  private connectToDb(){
    this.client = new Client(config);
    this.client.connect().then(()=>{
      this.connected = true;
      logger.info('PostgreSQL Connected')
    }).catch(err=>{
      logger.error('Error en DB!:',err);
    });
  }

  public static getInstance(): PostgresClient {
    if (!PostgresClient.instance) {
      PostgresClient.instance = new PostgresClient();
    }
    return PostgresClient.instance;
  }

  private async query(sql: string, params: any[] = []): Promise<any> {
    if(!this.connected) this.connectToDb();

    try {
      const result = await this.client.query(sql, params);
      this.lastQueryTime = new Date();
      return result.rows;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  public async loadChatInfo(prompt_name: PromptName, limit?): Promise<Chatinfo> {
    const query = `SELECT p.prompt_name, p.conversation_id, p.lastmessage_id, p.prompt_text, p.gif_url, m.role, m.message_text, m.name, m.created_at
                   FROM wenchotino.chats_cfg p
                            LEFT JOIN wenchotino.messages m ON p.conversation_id = m.conversation_id
                   WHERE p.prompt_name = $1
                   ORDER BY m.created_at DESC
                   LIMIT $2;`;
    const params = [prompt_name, limit?limit: MSGS_LIMIT];
    const rows = await this.query(query, params);

    const messages: GPTMessage[] = [];

    for (const row of rows) {
      if(!row.message_text) continue;
      messages.push({
        name: row.name,
        message_text: row.message_text,
        role: row.role,
        created_at: <string>row.created_at
      }
      )
    }

    messages.sort( (a,b) => new Date(<string>a.created_at).getTime() - new Date(<string>b.created_at).getTime())

    return {
      conversation_id: rows[0].conversation_id,
      lastmessage_id: rows[0].lastmessage_id,
      prompt_name: prompt_name,
      prompt_text: rows[0].prompt_text,
      gif_url: rows[0].gif_url,
      messages: messages
    }
  }

  public async saveChatMessage(conversation_id: string, name:string, role: GPTRol, messageContent: string){
    const sql = `
        INSERT INTO wenchotino.messages (conversation_id, role, message_text, name)
        VALUES ($1, $2, $3, $4);
    `;
    const params = [conversation_id, role, messageContent, name];
    await this.query(sql, params);
  }

  public async saveChatData(conversation_id: string, lastmessage_id: string){
    const sql = `UPDATE wenchotino.chats_cfg SET lastmessage_id = $1 WHERE conversation_id = $2`;
    const params = [lastmessage_id, conversation_id];
    await this.query(sql, params);
  }
}